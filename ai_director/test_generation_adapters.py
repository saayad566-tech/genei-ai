import pytest

def test_runner_installer_module_loads():
    import ai_director.runner_installer as installer
    assert hasattr(installer, "install_dependencies")
