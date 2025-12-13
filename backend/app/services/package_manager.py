import sys
import subprocess
import json
import logging
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

class PackageManager:
    @staticmethod
    def list_installed_packages() -> List[Dict[str, str]]:
        """
        Returns a list of installed packages with their versions.
        """
        try:
            # key is package name (lowercase), value is version
            result = subprocess.check_output(
                [sys.executable, "-m", "pip", "list", "--format=json"],
                stderr=subprocess.STDOUT
            )
            packages = json.loads(result)
            return packages # list of {name, version}
        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to list packages: {e.output.decode()}")
            return []
        except Exception as e:
            logger.error(f"Error listing packages: {str(e)}")
            return []

    @staticmethod
    def get_package_version(package_name: str) -> Optional[str]:
        """
        Returns the installed version of a package, or None if not installed.
        """
        packages = PackageManager.list_installed_packages()
        for pkg in packages:
            if pkg['name'].lower() == package_name.lower():
                return pkg['version']
        return None

    @staticmethod
    def install_package(package_name: str) -> bool:
        """
        Installs a package using pip.
        """
        try:
            logger.info(f"Installing package: {package_name}")
            subprocess.check_call(
                [sys.executable, "-m", "pip", "install", package_name],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            return True
        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to install {package_name}")
            # Log stdout/stderr if needed
            return False

    @staticmethod
    def upgrade_package(package_name: str) -> bool:
        """
        Upgrades a package using pip.
        """
        try:
            logger.info(f"Upgrading package: {package_name}")
            subprocess.check_call(
                [sys.executable, "-m", "pip", "install", "--upgrade", package_name],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            return True
        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to upgrade {package_name}")
            return False
