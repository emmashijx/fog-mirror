import argparse
import concurrent.futures
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.request
import zipfile


ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / ".local" / "fah-data"
REVISION = "9f8a86f47a83cb23226ae7ab696c0500dabf6c82"
FILES = {
    "fah-s/model.pt": "f469c80356391c2993c58b4421ef3ee81c36549af932cffed1824a038147484c",
    "fah-s/config.json": None,
    "shared/detector.pt": "6924e002703c7b3951bb8c19f9f75dcbfaf395b7ca28490f19bb30aab8561627",
    "shared/video_refiner.pt": "ec84bfbbe923cd6cdc0dc60dcb59cc16b3ee826976dac6fb15de21a06d3dcc16",
}
MHR_URL = "https://github.com/facebookresearch/MHR/releases/download/v1.0.1/assets.zip"
MHR_HASH = "352e271a6c42729c68554ceaea0c955e866970160c31e35506d782dc0f7377bc"
SAM_REPO = "facebook/sam-3d-body-dinov3"
SAM_CONFIG = DATA / "sam-3d-body-dinov3" / "model_config.yaml"
SAM_CONFIG_HASH = "1012fc3f39cb5e90e3f8fbadf7bded31604bfafdce0321d17a7c1a2d3f08b88d"
MACCAP_REPO = "cristianAdi13/maccap-model"
MACCAP_REVISION = "c7d269157b6b04a5be33b68d1b0e622c62de238b"


def digest(filename):
    result = hashlib.sha256()
    with filename.open("rb") as source:
        for block in iter(lambda: source.read(8 * 1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def download(url, target, expected=None):
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and (expected is None or digest(target) == expected):
        print(f"Ready: {target.relative_to(ROOT)}", flush=True)
        return
    partial = target.with_name(target.name + ".part")
    windows_curl = Path(os.environ.get("SystemRoot", "C:/Windows")) / "System32" / "curl.exe"
    if os.name == "nt" and windows_curl.exists():
        subprocess.run(
            [str(windows_curl), "--fail", "--location", "--silent", "--show-error",
             "--retry", "2", "--connect-timeout", "30", "--max-time", "1200",
             "--output", str(partial), url],
            check=True,
        )
    else:
        request = urllib.request.Request(url, headers={"User-Agent": "FogMirror-FAH-validation"})
        with urllib.request.urlopen(request, timeout=120) as source, partial.open("wb") as destination:
            shutil.copyfileobj(source, destination, length=1024 * 1024)
    if expected and digest(partial) != expected:
        raise RuntimeError(f"SHA-256 mismatch: {target.name}; partial file retained for inspection")
    os.replace(partial, target)
    print(f"Downloaded: {target.relative_to(ROOT)} ({target.stat().st_size:,} bytes)", flush=True)


def download_weight(item):
    filename, expected = item
    download(
        f"https://huggingface.co/noahcao/FAH/resolve/{REVISION}/{filename}?download=true",
        DATA / "weights" / filename,
        expected,
    )


def download_mhr():
    target = DATA / "sam-3d-body-dinov3" / "assets" / "mhr_model.pt"
    if target.exists() and digest(target) == MHR_HASH:
        print("Ready: MHR model", flush=True)
        return
    archive = DATA / "mhr-assets.zip"
    download(MHR_URL, archive)
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_suffix(".pt.part")
    with zipfile.ZipFile(archive) as source, source.open("assets/mhr_model.pt") as member:
        with partial.open("wb") as destination:
            shutil.copyfileobj(member, destination)
    if digest(partial) != MHR_HASH:
        raise RuntimeError("MHR model SHA-256 mismatch")
    os.replace(partial, target)
    archive.unlink()
    print("Verified: MHR model", flush=True)


def prerequisites():
    required = [DATA / "weights" / filename for filename in FILES]
    required += [SAM_CONFIG, DATA / "sam-3d-body-dinov3" / "assets" / "mhr_model.pt"]
    missing = [str(filename.relative_to(ROOT)) for filename in required if not filename.is_file()]
    config_valid = SAM_CONFIG.is_file() and digest(SAM_CONFIG) == SAM_CONFIG_HASH
    if SAM_CONFIG.is_file() and not config_valid:
        missing.append(str(SAM_CONFIG.relative_to(ROOT)) + " (SHA-256 mismatch)")
    return {
        "ready": not missing,
        "missing": missing,
        "weights_revision": REVISION,
        "authorization_url": f"https://huggingface.co/{SAM_REPO}",
        "config_verified": config_valid,
    }


def download_maccap_config():
    base = f"https://huggingface.co/{MACCAP_REPO}/resolve/{MACCAP_REVISION}"
    download(f"{base}/model_config.yaml", SAM_CONFIG, SAM_CONFIG_HASH)
    licenses = {}
    for filename in ("LICENSE", "LICENSE-DINOv3.md"):
        target = SAM_CONFIG.parent / "licenses" / filename
        download(f"{base}/{filename}", target)
        licenses[filename] = digest(target)
    manifest = {
        "repository": MACCAP_REPO,
        "revision": MACCAP_REVISION,
        "file": "model_config.yaml",
        "sha256": digest(SAM_CONFIG),
        "verified": True,
        "licenses_sha256": licenses,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
    (SAM_CONFIG.parent / "source.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--public-only", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--config-source", choices=("official", "maccap"), default="official")
    args = parser.parse_args()
    if args.check:
        result = prerequisites()
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0 if result["ready"] else 2
    DATA.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        futures = [executor.submit(download_weight, item) for item in FILES.items()]
        futures.append(executor.submit(download_mhr))
        for future in concurrent.futures.as_completed(futures):
            future.result()
    if not args.public_only and args.config_source == "maccap":
        download_maccap_config()
    elif not args.public_only and not SAM_CONFIG.exists():
        from huggingface_hub import hf_hub_download

        try:
            hf_hub_download(SAM_REPO, "model_config.yaml", local_dir=SAM_CONFIG.parent)
        except Exception as error:
            status = getattr(getattr(error, "response", None), "status_code", None)
            if status not in (401, 403):
                raise
            print(
                "Authorization required: obtain access on the official Hugging Face model page, "
                "then run the environment's hf auth login and retry, "
                "or select the pinned mirror with --config-source maccap.",
                flush=True,
            )
    result = prerequisites()
    (DATA / "setup-status.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0 if result["ready"] else 2


if __name__ == "__main__":
    sys.exit(main())
