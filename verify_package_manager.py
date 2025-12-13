import sys
import unittest
from unittest.mock import MagicMock, patch
import json

# Setup sys.modules for app.services.package_manager imports
sys.modules['app.core.auth'] = MagicMock()
# ... skipping others as PackageManager only needs standard libs
# actually PackageManager doesn't import app.* so we can just check it if we are in the right dir.

# Add backend to path
import os
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.services.package_manager import PackageManager

class TestPackageManager(unittest.TestCase):
    @patch('subprocess.Popen')
    def test_list_installed_packages_clean(self, mock_popen):
        # Mock clean output
        mock_process = MagicMock()
        mock_process.communicate.return_value = ('[{"name": "foo", "version": "1.0"}]', '')
        mock_process.returncode = 0
        mock_popen.return_value = mock_process

        pkgs = PackageManager.list_installed_packages()
        self.assertEqual(len(pkgs), 1)
        self.assertEqual(pkgs[0]['name'], 'foo')

    @patch('subprocess.Popen')
    def test_list_installed_packages_dirty(self, mock_popen):
        # Mock output with warning prefix
        dirty_output = 'WARNING: You are using an old pip.\n[{"name": "bar", "version": "2.0"}]'
        mock_process = MagicMock()
        mock_process.communicate.return_value = (dirty_output, 'Some stderr warning')
        mock_process.returncode = 0
        mock_popen.return_value = mock_process

        pkgs = PackageManager.list_installed_packages()
        self.assertEqual(len(pkgs), 1)
        self.assertEqual(pkgs[0]['name'], 'bar')

if __name__ == '__main__':
    unittest.main()
