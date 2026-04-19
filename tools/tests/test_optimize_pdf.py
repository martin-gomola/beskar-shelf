"""Tests for beskar_tools.cli.optimize_pdf."""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest
from click.testing import CliRunner

from beskar_tools.cli import optimize_pdf as opt


def test_human_size_formats_each_unit() -> None:
    assert opt.human_size(0) == "0.0 B"
    assert opt.human_size(2_048) == "2.0 KB"
    assert opt.human_size(5 * 1024**2) == "5.0 MB"
    assert opt.human_size(3 * 1024**3) == "3.0 GB"


def test_cli_rejects_non_pdf_input(tmp_path: Path) -> None:
    txt = tmp_path / "not-a-pdf.txt"
    txt.write_text("hello", encoding="utf-8")

    result = CliRunner().invoke(opt.main, [str(txt)])

    assert result.exit_code != 0
    assert "input is not a PDF" in result.output


def test_cli_rejects_output_equal_to_input(tmp_path: Path) -> None:
    pdf = tmp_path / "book.pdf"
    pdf.write_bytes(b"%PDF-1.4\n%%EOF\n")

    result = CliRunner().invoke(opt.main, [str(pdf), "--output", str(pdf)])

    assert result.exit_code != 0
    assert "output cannot be the same file as input" in result.output


def test_cli_rejects_quality_outside_range(tmp_path: Path) -> None:
    pdf = tmp_path / "book.pdf"
    pdf.write_bytes(b"%PDF-1.4\n%%EOF\n")

    result = CliRunner().invoke(opt.main, [str(pdf), "--quality", "0"])

    assert result.exit_code != 0


def test_check_qpdf_raises_when_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(opt.shutil, "which", lambda _name: None)

    with pytest.raises(opt.OptimizeError, match="qpdf not found"):
        opt._check_qpdf()


def _real_pdf(path: Path) -> bool:
    """Generate a minimal valid PDF at `path`. Skip the test if pymupdf missing."""

    fitz = pytest.importorskip("fitz")
    doc = fitz.open()
    try:
        page = doc.new_page()  # default A4
        page.insert_text((72, 72), "Beskar Shelf optimize-pdf test fixture.")
        doc.save(path, garbage=0, deflate=False)
    finally:
        doc.close()
    return True


@pytest.mark.skipif(shutil.which("qpdf") is None, reason="qpdf not installed")
def test_lossless_optimise_writes_linearised_output(tmp_path: Path) -> None:
    src = tmp_path / "book.pdf"
    _real_pdf(src)
    dst = tmp_path / "book.opt.pdf"

    opt.lossless_optimise(src, dst)

    assert dst.is_file()
    head = dst.read_bytes()[:1024]
    # qpdf --linearize emits a /Linearized hint dictionary in the first object.
    assert b"/Linearized" in head, head[:200]


def test_linearise_in_place_quiet_reports_missing_qpdf(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Pretend qpdf isn't installed: the helper must not raise."""

    def fake_run(*_args: object, **_kwargs: object) -> None:
        raise FileNotFoundError("qpdf")

    monkeypatch.setattr(opt.subprocess, "run", fake_run)
    pdf = tmp_path / "book.pdf"
    pdf.write_bytes(b"%PDF-1.4\n%%EOF\n")

    ok, err = opt.linearise_in_place_quiet(pdf)

    assert ok is False
    assert err is not None and "qpdf not found" in err


def test_linearise_in_place_quiet_surfaces_qpdf_error(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A qpdf failure (e.g. malformed PDF) should be returned, not raised."""

    import subprocess as _sp  # local alias to keep monkeypatch local

    def fake_run(*_args: object, **_kwargs: object) -> None:
        raise _sp.CalledProcessError(
            returncode=2,
            cmd=["qpdf"],
            output="",
            stderr="qpdf: book.pdf: file is damaged\nWARNING: trailing junk\n",
        )

    monkeypatch.setattr(opt.subprocess, "run", fake_run)
    pdf = tmp_path / "book.pdf"
    pdf.write_bytes(b"not really a pdf")

    ok, err = opt.linearise_in_place_quiet(pdf)

    assert ok is False
    # We surface the last non-empty stderr line for a tight one-line message.
    assert err == "WARNING: trailing junk"


@pytest.mark.skipif(shutil.which("qpdf") is None, reason="qpdf not installed")
def test_linearise_in_place_quiet_succeeds_on_real_pdf(tmp_path: Path) -> None:
    src = tmp_path / "book.pdf"
    _real_pdf(src)

    ok, err = opt.linearise_in_place_quiet(src)

    assert ok is True
    assert err is None
    head = src.read_bytes()[:1024]
    assert b"/Linearized" in head, head[:200]
