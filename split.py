from __future__ import annotations

import csv
import re
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parent
SOURCE_DIR = ROOT / "원문"
OUTPUT_PATH = ROOT / "data" / "문항목록.csv"
FIELDS = ["파일명", "위원회", "의원", "제출기한", "문항번호", "요구내용", "세부항목", "비고"]

HEADER_RE = re.compile(
    r"^(?P<committee>\S+위원회)\s+(?P<member>\S+)\s+의원실\s+자료요구서$"
)
DEADLINE_RE = re.compile(
    r"제출기한:\s*(?P<year>\d{4})\.\s*(?P<month>\d{1,2})\.\s*(?P<day>\d{1,2})\."
)
ITEM_RE = re.compile(r"^(?P<number>\d+)\.\s*(?P<text>.*)$")
SUBITEM_RE = re.compile(r"^(?P<label>[가나])\.\s*(?P<text>.*)$")
EXPECTED_COUNT_RE = re.compile(r"_(?P<count>\d+)문항\.pdf$")


def clean_line(line: str) -> str:
    return re.sub(r"\s+", " ", line).strip()


def append_text(parts: list[str], text: str) -> None:
    text = clean_line(text)
    if not text:
        return
    if parts:
        parts[-1] = f"{parts[-1]} {text}"
    else:
        parts.append(text)


def extract_lines(pdf_path: Path) -> list[str]:
    reader = PdfReader(str(pdf_path))
    lines: list[str] = []
    for page in reader.pages:
        page_text = page.extract_text() or ""
        lines.extend(page_text.splitlines())
    return lines


def parse_pdf(pdf_path: Path) -> list[dict[str, str]]:
    lines = extract_lines(pdf_path)
    committee = ""
    member = ""
    deadline = ""

    for raw_line in lines:
        line = clean_line(raw_line)
        if not line:
            continue
        header_match = HEADER_RE.match(line)
        if header_match:
            committee = header_match.group("committee")
            member = header_match.group("member")
        deadline_match = DEADLINE_RE.search(line)
        if deadline_match:
            deadline = (
                f"{deadline_match.group('year')}-"
                f"{int(deadline_match.group('month')):02d}-"
                f"{int(deadline_match.group('day')):02d}"
            )

    if not committee or not member:
        raise ValueError(f"머리말에서 위원회·의원을 찾지 못했습니다: {pdf_path.name}")
    if not deadline:
        raise ValueError(f"제출기한을 찾지 못했습니다: {pdf_path.name}")

    parsed: list[dict[str, object]] = []
    current: dict[str, object] | None = None
    current_target: tuple[str, int | None] | None = None

    for raw_line in lines:
        line = clean_line(raw_line)
        if not line:
            continue
        if HEADER_RE.match(line):
            continue
        if line.startswith("수신:") or line.startswith("담당 보좌관:") or line == "끝.":
            continue

        item_match = ITEM_RE.match(line)
        if item_match:
            current = {
                "파일명": pdf_path.name,
                "위원회": committee,
                "의원": member,
                "제출기한": deadline,
                "문항번호": int(item_match.group("number")),
                "요구내용_parts": [clean_line(item_match.group("text"))],
                "세부항목_parts": [],
                "비고_parts": [],
            }
            parsed.append(current)
            current_target = ("요구내용_parts", 0)
            continue

        if current is None:
            continue

        subitem_match = SUBITEM_RE.match(line)
        if subitem_match:
            subitems = current["세부항목_parts"]
            assert isinstance(subitems, list)
            subitems.append(
                f"{subitem_match.group('label')}. {clean_line(subitem_match.group('text'))}"
            )
            current_target = ("세부항목_parts", len(subitems) - 1)
            continue

        if line.startswith("※"):
            notes = current["비고_parts"]
            assert isinstance(notes, list)
            notes.append(line)
            current_target = ("비고_parts", len(notes) - 1)
            continue

        if current_target is not None:
            field, index = current_target
            parts = current[field]
            assert isinstance(parts, list)
            if index is None:
                append_text(parts, line)
            elif parts:
                parts[index] = f"{parts[index]} {line}"

    rows: list[dict[str, str]] = []
    for item in parsed:
        rows.append(
            {
                "파일명": str(item["파일명"]),
                "위원회": str(item["위원회"]),
                "의원": str(item["의원"]),
                "제출기한": str(item["제출기한"]),
                "문항번호": str(item["문항번호"]),
                "요구내용": " ".join(item["요구내용_parts"]),
                "세부항목": "\n".join(item["세부항목_parts"]),
                "비고": "\n".join(item["비고_parts"]),
            }
        )
    return rows


def validate(pdf_path: Path, rows: list[dict[str, str]]) -> dict[str, str]:
    count_match = EXPECTED_COUNT_RE.search(pdf_path.name)
    if not count_match:
        raise ValueError(f"파일명에서 문항 수를 찾지 못했습니다: {pdf_path.name}")
    expected_count = int(count_match.group("count"))
    numbers = [int(row["문항번호"]) for row in rows]
    last_number = numbers[-1] if numbers else 0
    consecutive = numbers == list(range(1, expected_count + 1))
    matched = len(rows) == expected_count and last_number == expected_count and consecutive
    return {
        "파일명": pdf_path.name,
        "파일명의 문항 수": str(expected_count),
        "뽑은 문항 수": str(len(rows)),
        "마지막 번호": str(last_number),
        "번호 연속": "O" if consecutive else "X",
        "일치": "O" if matched else "X",
    }


def print_validation(results: list[dict[str, str]]) -> None:
    columns = ["파일명", "파일명의 문항 수", "뽑은 문항 수", "마지막 번호", "번호 연속", "일치"]
    print(" | ".join(columns))
    print(" | ".join(["---"] * len(columns)))
    for result in results:
        print(" | ".join(result[column] for column in columns))


def main() -> None:
    pdf_paths = sorted(SOURCE_DIR.glob("*.pdf"))
    if len(pdf_paths) != 3:
        raise ValueError(f"원문 PDF가 3건이어야 합니다. 현재 {len(pdf_paths)}건입니다.")

    all_rows: list[dict[str, str]] = []
    validation_results: list[dict[str, str]] = []
    for pdf_path in pdf_paths:
        rows = parse_pdf(pdf_path)
        all_rows.extend(rows)
        validation_results.append(validate(pdf_path, rows))

    if any(result["일치"] == "X" for result in validation_results):
        print_validation(validation_results)
        raise ValueError("문항 수 또는 번호가 원문 파일명과 일치하지 않아 CSV를 쓰지 않았습니다.")

    with OUTPUT_PATH.open("w", encoding="utf-8-sig", newline="") as output_file:
        writer = csv.DictWriter(output_file, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(all_rows)

    print_validation(validation_results)
    print(f"합계 | {sum(int(result['파일명의 문항 수']) for result in validation_results)} | {len(all_rows)}")
    print(f"저장: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
