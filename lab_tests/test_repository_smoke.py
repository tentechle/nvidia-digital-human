from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_repository_has_readme():
    assert any(ROOT.glob("README*")), "upstream documentation is missing"


def test_repository_keeps_its_license():
    assert any(ROOT.glob("LICENSE*")), "upstream license is missing"
