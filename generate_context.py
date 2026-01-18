import os

# --- CONFIGURATION ---
OUTPUT_FILE = "project_context_dump.txt"

# Folders to completely ignore
IGNORE_DIRS = {
    'node_modules', '.git', 'dist', 'build', 'coverage', 
    '.next', '__pycache__', '.vscode', '.idea'
}

# File extensions to ignore (binaries, images, locks)
IGNORE_EXTENSIONS = {
    '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', 
    '.pdf', '.zip', '.tar', '.gz', '.7z', '.rar', 
    '.exe', '.dll', '.so', '.dylib', '.class', 
    '.pyc', '.lock', 'package-lock.json', 'yarn.lock'
}

# Specific files to ignore
IGNORE_FILES = {
    '.DS_Store', 'thumbs.db', 'generate_context.py', OUTPUT_FILE, '.env'
}

def is_ignored(path):
    """Checks if a file or directory should be ignored."""
    name = os.path.basename(path)
    if name in IGNORE_FILES:
        return True
    if name in IGNORE_DIRS:
        return True
    _, ext = os.path.splitext(name)
    if ext.lower() in IGNORE_EXTENSIONS:
        return True
    return False

def generate_tree(startpath):
    """Generates a visual tree structure string."""
    tree_str = "========================================\n"
    tree_str += "PROJECT DIRECTORY STRUCTURE\n"
    tree_str += "========================================\n\n"
    
    for root, dirs, files in os.walk(startpath):
        # Modify dirs in-place to skip ignored directories during traversal
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        
        level = root.replace(startpath, '').count(os.sep)
        indent = ' ' * 4 * (level)
        tree_str += f"{indent}{os.path.basename(root)}/\n"
        subindent = ' ' * 4 * (level + 1)
        
        for f in files:
            if not is_ignored(f):
                tree_str += f"{subindent}{f}\n"
                
    tree_str += "\n\n"
    return tree_str

def dump_file_contents(startpath):
    """Walks through files and dumps their content."""
    content_str = "========================================\n"
    content_str += "FILE CONTENTS\n"
    content_str += "========================================\n\n"

    for root, dirs, files in os.walk(startpath):
        # Skip ignored directories
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]

        for file in files:
            file_path = os.path.join(root, file)
            
            if is_ignored(file_path):
                continue

            # Create a relative path for the header (e.g., ./src/index.ts)
            rel_path = os.path.relpath(file_path, startpath)

            try:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    file_content = f.read()
                    
                content_str += f"--- START FILE: {rel_path} ---\n"
                content_str += file_content + "\n"
                content_str += f"--- END FILE: {rel_path} ---\n\n"
                
                print(f"Processed: {rel_path}")
                
            except Exception as e:
                print(f"Skipping {rel_path}: {e}")

    return content_str

def main():
    print(f"🚀 Starting context capture...")
    
    # 1. Generate Tree
    tree_view = generate_tree(".")
    
    # 2. Dump Content
    file_contents = dump_file_contents(".")
    
    # 3. Write to Output File
    with open(OUTPUT_FILE, "w", encoding="utf-8") as out:
        out.write(tree_view)
        out.write(file_contents)
        
    print(f"\n✅ Done! Context saved to: {OUTPUT_FILE}")
    print("   Please upload this file to the chat.")

if __name__ == "__main__":
    main()
