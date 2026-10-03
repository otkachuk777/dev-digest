# Tools this repo's scripts, hooks, skills and agents run. Works with Homebrew on macOS, Linux and WSL2.
#   brew bundle check --no-upgrade   # are they all here? (changes nothing)
#   brew bundle                      # install what is missing
# scripts/doctor.sh checks versions and the parts brew cannot (perl, plugins, docker daemon, gh auth);
# scripts/doctor.test.sh fails when this list and doctor's table drift apart.

# required
brew "git"
brew "jq"
brew "python@3.13"
brew "node@22", link: true
brew "pnpm"
brew "gh"
cask "docker-desktop" if OS.mac?   # Linux/WSL2: install Docker Engine from your distro

# optional
brew "ripgrep"   # real rg for the rtk hook
brew "ruby"      # agent-frontmatter YAML check (macOS also has a system ruby)
brew "rtk"       # only if you use the rtk hook in ~/.claude
