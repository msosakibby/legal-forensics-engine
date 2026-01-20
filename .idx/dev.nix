# .idx/dev.nix - Project IDX Configuration
{ pkgs, ... }: {
  # The Nix channel determines the version of packages available.
  # "stable-23.11" is a safe default.
  channel = "stable-23.11"; 

  # 1. System Packages
  # Define the tools your project needs here.
  packages = [
    # Common tools
    pkgs.git
    pkgs.curl
    pkgs.jq

    # --- UNCOMMENT THE LANGUAGES YOU NEED ---
    # pkgs.nodejs_20
    # pkgs.python3
    # pkgs.go
    # pkgs.jdk17
    # pkgs.rustc
    # pkgs.cargo
  ];

  # 2. Environment Variables
  env = {
    # Example: PORT = "3000";
  };

  # 3. IDX Specific Configuration
  idx = {
    # Search for extension IDs on the Open VSX Registry
    extensions = [
      # "vscodevim.vim"
      # "esbenp.prettier-vscode"
    ];

    # 4. Previews
    # This allows you to see your app running in the browser panel
    previews = {
      enable = true;
      previews = {
        # Example for a web app
        # web = {
        #   command = ["npm" "run" "dev" "--" "--port" "$PORT" "--host" "0.0.0.0"];
        #   manager = "web";
        # };
      };
    };

    # 5. Lifecycle Hooks
    # Commands to run when the workspace is created or started
    workspace = {
      onCreate = {
        # Example: Install dependencies automatically
        # npm-install = "npm install";
        # pip-install = "pip install -r requirements.txt";
      };
      onStart = {
        # Example: Start a file watcher
        # watch = "npm run watch";
      };
    };
  };
}

