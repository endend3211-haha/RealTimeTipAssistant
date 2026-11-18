"""Build the standalone Android receiver using installed SDK tools (no Gradle downloads)."""
import os
from pathlib import Path
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parent
SDK = Path(os.environ.get("ANDROID_HOME", Path.home() / "AppData/Local/Android/Sdk"))
TOOLS = SDK / "build-tools" / "35.0.0"
ANDROID = SDK / "platforms/android-35/android.jar"
BUILD = ROOT / ".build"
DIST = ROOT.parents[1] / "dist"
def run(*args):
    subprocess.run([str(x) for x in args], check=True)
def main():
    for directory in [BUILD / "classes", BUILD / "dex", DIST]:
        directory.mkdir(parents=True, exist_ok=True)
    sources = list((ROOT / "src").rglob("*.java"))
    run("javac", "-encoding", "UTF-8", "-source", "8", "-target", "8",
        "-classpath", ANDROID, "-d", BUILD / "classes", *sources)
    classes_jar = BUILD / "classes.jar"
    with zipfile.ZipFile(classes_jar, "w") as archive:
        for path in (BUILD / "classes").rglob("*.class"):
            archive.write(path, path.relative_to(BUILD / "classes").as_posix())
    run(TOOLS / "d8.bat", "--min-api", "26", "--lib", ANDROID,
        "--output", BUILD / "dex", classes_jar)
    resources = BUILD / "resources.zip"
    run(TOOLS / "aapt2.exe", "compile", "--dir", ROOT / "res", "-o", resources)
    unsigned = BUILD / "receiver-unsigned.apk"
    run(TOOLS / "aapt2.exe", "link", "-I", ANDROID, "--manifest",
        ROOT / "AndroidManifest.xml", "-o", unsigned, resources)
    with zipfile.ZipFile(unsigned, "a") as archive:
        archive.write(BUILD / "dex/classes.dex", "classes.dex")
    aligned = BUILD / "receiver-aligned.apk"
    run(TOOLS / "zipalign.exe", "-f", "4", unsigned, aligned)
    key = BUILD / "development.keystore"
    if not key.exists():
        run("keytool", "-genkeypair", "-keystore", key, "-storepass", "android",
            "-keypass", "android", "-alias", "development", "-keyalg", "RSA",
            "-keysize", "2048", "-validity", "3650", "-dname", "CN=MemoMind Gemini Development")
    output = DIST / "gemini-loopback-bridge-1.2.0.apk"
    run(TOOLS / "apksigner.bat", "sign", "--ks", key, "--ks-key-alias", "development",
        "--ks-pass", "pass:android", "--key-pass", "pass:android", "--out", output, aligned)
    run(TOOLS / "apksigner.bat", "verify", "--verbose", output)
    print("Built:", output)
if __name__ == "__main__":
    main()

