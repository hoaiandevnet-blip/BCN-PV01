"""Compare generated meeting text and originals against the four requested DOCX files."""
import hashlib
import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location(
    "meeting_import", root / "scripts" / "import-smart-meeting-documents.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

for doc_id, source in module.SOURCES.items():
    saved = []
    for part in sorted(module.OUT.glob(f"{doc_id}-*.json")):
        saved.extend(json.loads(part.read_text()))
    assert saved == module.blocks_for(doc_id), doc_id + " content mismatch"
    original = module.OUT.parent / "originals" / f"{doc_id}.docx"
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    assert source_hash == hashlib.sha256(original.read_bytes()).hexdigest()
    for block in saved:
        if block.get("runs"):
            assert "".join(run["text"] for run in block["runs"]) == block["text"], block["id"]
    notes = sum(bool(block.get("noteNumber")) for block in saved)
    print(f"PASS {doc_id}: {len(saved)} blocks, {notes} footnotes; original SHA256 identical")

print("PASS document parity at " + datetime.now(timezone.utc).isoformat())
