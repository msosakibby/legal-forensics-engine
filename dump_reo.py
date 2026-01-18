import os

# Files/Folders to IGNORE
IGNORE_DIRS = {'.git', 'node_modules', 'dist', 'build', '.next', 'coverage'}
IGNORE_EXTS = {'.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.lock', '.pyc'}
INCLUDE_EXTS = {'.ts', '.tsx', '.js', '.json', '.sql', '.yaml', '.yml', '.dockerfile', 'Dockerfile', '.sh', '.md'}

def is_text_file(filename):
    return any(filename.endswith(ext) for ext in INCLUDE_EXTS) or filename == 'Dockerfile'

def dump_codebase():
    output_file = "full_project_context.txt"
    
    with open(output_file, "w", encoding="utf-8") as outfile:
        # Walk the current directory
        for root, dirs, files in os.walk("."):
            # Modify dirs in-place to skip ignored directories
            dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
            
            for file in files:
                if is_text_file(file) and file != "dump_repo.py" and file != output_file:
                    file_path = os.path.join(root, file)
                    
                    try:
                        print(f"Adding: {file_path}")
                        outfile.write(f"\n\n{'='*80}\n")
                        outfile.write(f"FILE: {file_path}\n")
                        outfile.write(f"{'='*80}\n\n")
                        
                        with open(file_path, "r", encoding="utf-8") as infile:
                            outfile.write(infile.read())
                            
                    except Exception as e:
                        print(f"Skipping {file_path}: {e}")

    print(f"\n✅ Done! Upload '{output_file}' to the chat.")

if __name__ == "__main__":
    dump_codebase()
