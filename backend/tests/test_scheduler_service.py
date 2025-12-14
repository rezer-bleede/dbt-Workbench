from app.schemas.scheduler import BackoffStrategy, RetryPolicy
from app.services.scheduler_service import scheduler_service


def test_compute_retry_delay_fixed_strategy() -> None:
    policy = RetryPolicy(
        max_retries=3,
        delay_seconds=10,
        backoff_strategy=BackoffStrategy.FIXED,
    )

    # All attempts should use the same delay for fixed strategy
    assert scheduler_service.compute_retry_delay(policy, 1) == 10
    assert scheduler_service.compute_retry_delay(policy, 2) == 10
    assert scheduler_service.compute_retry_delay(policy, 5) == 10


def test_compute_retry_delay_exponential_with_cap() -> None:
    policy = RetryPolicy(
        max_retries=5,
        delay_seconds=10,
        backoff_strategy=BackoffStrategy.EXPONENTIAL,
        max_delay_seconds=40,
    )

    # Exponential backoff: 10, 20, 40, 40 (capped)
    assert scheduler_service.compute_retry_delay(policy, 1) == 10
    assert scheduler_service.compute_retry_delay(policy, 2) == 20
    assert scheduler_service.compute_retry_delay(policy, 3) == 40
    assert scheduler_service.compute_retry_delay(policy, 4) == 40