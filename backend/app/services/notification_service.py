import logging
import smtplib
from email.message import EmailMessage
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import get_settings
from app.schemas.scheduler import (
    NotificationChannelType,
    NotificationConfig,
    NotificationTrigger,
)

logger = logging.getLogger(__name__)


class NotificationService:
    def __init__(self) -> None:
        self.settings = get_settings()

    async def send_notifications(
        self,
        notification_config: NotificationConfig,
        trigger: NotificationTrigger,
        payload: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []

        if notification_config.slack and notification_config.slack.enabled:
            results.append(
                await self._send_slack(notification_config.slack.webhook_url, trigger, payload)
            )

        if notification_config.email and notification_config.email.enabled:
            results.append(
                await self._send_email(notification_config.email.recipients, trigger, payload)
            )

        if notification_config.webhook and notification_config.webhook.enabled:
            results.append(
                await self._send_webhook(
                    notification_config.webhook.endpoint_url,
                    notification_config.webhook.headers,
                    trigger,
                    payload,
                )
            )

        return results

    async def test_notifications(
        self,
        notification_config: NotificationConfig,
        payload: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        test_trigger = NotificationTrigger.RUN_STARTED
        return await self.send_notifications(notification_config, test_trigger, payload)

    async def _send_slack(
        self,
        webhook_url: str,
        trigger: NotificationTrigger,
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        result: Dict[str, Any] = {
            "channel": NotificationChannelType.SLACK.value,
            "trigger": trigger.value,
            "success": False,
            "error_message": None,
        }

        data = {
            "text": f"[dbt-Workbench] Event: {trigger.value}\n"
            f"Run ID: {payload.get('run_id')}\n"
            f"Schedule: {payload.get('schedule_name')} ({payload.get('schedule_id')})\n"
            f"Status: {payload.get('status')}",
        }

        try:
            timeout = self.settings.notifications_slack_timeout_seconds
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(webhook_url, json=data)
                response.raise_for_status()
            result["success"] = True
        except Exception as exc:
            logger.error("Failed to send Slack notification: %s", exc)
            result["error_message"] = str(exc)

        return result

    async def _send_webhook(
        self,
        endpoint_url: str,
        headers: Dict[str, str],
        trigger: NotificationTrigger,
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        result: Dict[str, Any] = {
            "channel": NotificationChannelType.WEBHOOK.value,
            "trigger": trigger.value,
            "success": False,
            "error_message": None,
        }

        data = {
            "trigger": trigger.value,
            "run_id": payload.get("run_id"),
            "schedule_id": payload.get("schedule_id"),
            "schedule_name": payload.get("schedule_name"),
            "timestamps": payload.get("timestamps", {}),
            "status": payload.get("status"),
            "attempt_number": payload.get("attempt_number"),
            "environment": payload.get("environment"),
            "command": payload.get("command"),
            "log_links": payload.get("log_links"),
            "artifact_links": payload.get("artifact_links"),
        }

        try:
            timeout = self.settings.notifications_webhook_timeout_seconds
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(endpoint_url, headers=headers, json=data)
                response.raise_for_status()
            result["success"] = True
        except Exception as exc:
            logger.error("Failed to send webhook notification: %s", exc)
            result["error_message"] = str(exc)

        return result

    async def _send_email(
        self,
        recipients: List[str],
        trigger: NotificationTrigger,
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        result: Dict[str, Any] = {
            "channel": NotificationChannelType.EMAIL.value,
            "trigger": trigger.value,
            "success": False,
            "error_message": None,
        }

        if not recipients:
            result["error_message"] = "No recipients configured"
            return result

        subject = f"[dbt-Workbench] dbt run {trigger.value.replace('_', ' ')}"
        body_lines = [
            f"Event: {trigger.value}",
            f"Run ID: {payload.get('run_id')}",
            f"Schedule: {payload.get('schedule_name')} ({payload.get('schedule_id')})",
            f"Environment: {payload.get('environment')}",
            f"Status: {payload.get('status')}",
            "",
            f"Log URL: {payload.get('log_links', {}).get('run_detail')}",
            f"Artifacts URL: {payload.get('artifact_links', {}).get('artifacts')}",
        ]
        body = "\n".join(body_lines)

        message = EmailMessage()
        message["From"] = self.settings.notifications_email_from
        message["To"] = ", ".join(recipients)
        message["Subject"] = subject
        message.set_content(body)

        try:
            host = self.settings.notifications_email_smtp_host
            port = self.settings.notifications_email_smtp_port
            use_tls = self.settings.notifications_email_use_tls
            username = self.settings.notifications_email_username
            password = self.settings.notifications_email_password

            if use_tls:
                server = smtplib.SMTP(host, port)
                server.starttls()
            else:
                server = smtplib.SMTP(host, port)

            try:
                if username and password:
                    server.login(username, password)
                server.send_message(message)
            finally:
                server.quit()

            result["success"] = True
        except Exception as exc:
            logger.error("Failed to send email notification: %s", exc)
            result["error_message"] = str(exc)

        return result


notification_service = NotificationService()