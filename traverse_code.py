import os
import datetime

# --- CONFIGURATION ---
# The root directory to start scanning ('.' means current directory)
ROOT_DIR = "."

# The output file name
OUTPUT_FILE = "CODEBASE_DUMP.md"

# Directories to strictly ignore
IGNORE_DIRS = {
    "node_modules",
    ".git",
    "dist",
    "build",
    "coverage",
    ".next",
    "__pycache__",
    ".vscode",
    ".idea"
}

# File extensions to include in the dump
INCLUDE_EXTENSIONS = {
    ".ts",
    ".js",
    ".tsx",
    ".jsx",
    ".json",
    ".yaml",
    ".yml",
    ".sh",
    ".md",
    "Dockerfile", # Dockerfiles often have no extension
    "Makefile"    # Makefiles often have no extension
}

# Specific filenames to always include (even if extension doesn't match)
INCLUDE_FILES = {
    "Dockerfile",
    "docker-compose.yml",
    "package.json",
    "tsconfig.json",
    ".env.example", # Do not include real .env files
    "cloudbuild.yaml",
    "cloudbuild_splitter.yaml",
    "cloudbuild_processor.yaml",
    "cloudbuild_aggregator.yaml",
    "cloudbuild_dispatcher.yaml",
    "cloudbuild_media.yaml"
}

def is_text_file(filepath):
    """
    Simple heuristic to check if a file is text-based and readable.
    """
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            f.read(1024)
            return True
    except (UnicodeDecodeError, IOError):
        return False

def generate_codebase_dump():
    print(f"🚀 Starting codebase traversal from: {os.path.abspath(ROOT_DIR)}")
    print(f"📝 Output will be saved to: {OUTPUT_FILE}")
    
    start_time = datetime.datetime.now()
    file_count = 0
    
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as out:
        # Write Header
        out.write(f"# LEGAL FORENSICS ENGINE - CODEBASE DUMP\n")
        out.write(f"Generated: {start_time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        out.write(f"Root: {os.path.abspath(ROOT_DIR)}\n")
        out.write("-" * 80 + "\n\n")

        for root, dirs, files in os.walk(ROOT_DIR):
            # Modify 'dirs' in-place to prune ignored directories
            dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]

            for file in files:
                file_path = os.path.join(root, file)
                ext = os.path.splitext(file)[1]

                # Check filtering rules
                should_process = (
                    ext in INCLUDE_EXTENSIONS or 
                    file in INCLUDE_FILES or
                    (file.startswith("Dockerfile") and "." not in file) # Catches Dockerfile.splitter etc.
                )

                if should_process:
                    # Double check it's not a binary file
                    if is_text_file(file_path):
                        print(f"   Processing: {file_path}")
                        
                        # Write File Header
                        rel_path = os.path.relpath(file_path, ROOT_DIR)
                        out.write(f"## File: {rel_path}\n")
                        out.write("```" + (ext.lstrip('.') if ext else 'text') + "\n")
                        
                        try:
                            with open(file_path, 'r', encoding='utf-8') as f:
                                content = f.read()
                                out.write(content)
                        except Exception as e:
                            out.write(f"!! ERROR READING FILE: {e} !!")
                        
                        out.write("\n```\n")
                        out.write("-" * 40 + "\n\n")
                        file_count += 1
                    else:
                        print(f"   ⚠️  Skipping binary file: {file_path}")

    end_time = datetime.datetime.now()
    duration = end_time - start_time
    
    print("\n" + "="*50)
    print(f"✅ COMPLETE")
    print(f"📂 Files Processed: {file_count}")
    print(f"⏱️  Time Taken: {duration}")
    print(f"📄 Database saved to: {OUTPUT_FILE}")
    print("="*50)

if __name__ == "__main__":
    generate_codebase_dump()
