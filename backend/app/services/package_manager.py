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
            # key is package name (lowercase), value is version
            # Use Popen to capture stdout/stderr separately
            process = subprocess.Popen(
                [sys.executable, "-m", "pip", "list", "--format=json"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True 
            )
            stdout, stderr = process.communicate()
            
            if process.returncode != 0:
                logger.error(f"Failed to list packages (exited {process.returncode}): {stderr}")
                return []
                
            # Try to find the JSON array in stdout (sometimes pip prints warnings to stdout too)
            try:
                # Naive attempt: look for start of JSON array
                json_start = stdout.find('[')
                if json_start != -1:
                    stdout = stdout[json_start:]
                
                packages = json.loads(stdout)
                return packages
            except json.JSONDecodeError as e:
                 logger.error(f"Failed to parse pip list output: {e}. Output was: {stdout}")
                 return []
        except Exception as e:
            logger.error(f"Error listing packages: {str(e)}")
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
