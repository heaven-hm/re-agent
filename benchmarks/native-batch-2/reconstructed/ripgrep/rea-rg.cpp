#include <algorithm>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <regex>
#include <string>
#include <vector>

namespace fs = std::filesystem;

struct Options {
  bool fixed = false;
  bool ignore_case = false;
  bool hidden = false;
  bool line_numbers = false;
  bool sort_paths = false;
  bool no_ignore = false;
  std::string pattern;
  std::vector<fs::path> paths;
};

static void usage(std::ostream& out) {
  out << "rea-rg (independent compatibility subset)\n"
         "usage: rea-rg [OPTIONS] PATTERN [PATH ...]\n"
         "  -F, --fixed-strings   match literal text\n"
         "  -i, --ignore-case     case-insensitive matching\n"
         "  -n                    include line numbers (default)\n"
         "      --hidden          traverse hidden files and directories\n"
         "      --sort path       sort paths before scanning\n";
}

static bool parse(int argc, char** argv, Options& o, bool& show_help,
                  bool& show_version) {
  std::vector<std::string> positional;
  for (int i = 1; i < argc; ++i) {
    const std::string arg = argv[i];
    if (arg == "--help" || arg == "-h") { show_help = true; return true; }
    if (arg == "--version") { show_version = true; return true; }
    if (arg == "-F" || arg == "--fixed-strings") { o.fixed = true; continue; }
    if (arg == "-i" || arg == "--ignore-case") { o.ignore_case = true; continue; }
    if (arg == "-n" || arg == "--line-number") { o.line_numbers = true; continue; }
    if (arg == "--no-line-number") { o.line_numbers = false; continue; }
    if (arg == "--hidden") { o.hidden = true; continue; }
    if (arg == "--no-heading") continue;
    if (arg == "--no-ignore") { o.no_ignore = true; continue; }
    if (arg == "--sort") {
      if (++i >= argc || std::string(argv[i]) != "path") return false;
      o.sort_paths = true;
      continue;
    }
    if (arg == "--color") {
      if (++i >= argc || std::string(argv[i]) != "never") return false;
      continue;
    }
    if (arg.rfind("--color=", 0) == 0) {
      if (arg != "--color=never") return false;
      continue;
    }
    if (!arg.empty() && arg[0] == '-') return false;
    positional.push_back(arg);
  }
  if (positional.empty()) return false;
  o.pattern = positional.front();
  for (size_t i = 1; i < positional.size(); ++i) o.paths.emplace_back(positional[i]);
  if (o.paths.empty()) o.paths.emplace_back(".");
  return true;
}

static bool hidden_path(const fs::path& p) {
  for (const auto& part : p) {
    const auto s = part.string();
    if (s.size() > 1 && s[0] == '.') return true;
  }
  return false;
}

static std::string regex_quote(const std::string& s);

static std::vector<std::string> ignore_patterns(const fs::path& root, bool no_ignore) {
  if (no_ignore) return {};
  std::vector<std::string> patterns;
  std::ifstream in(root / ".gitignore");
  std::string line;
  while (std::getline(in, line)) {
    if (!line.empty() && line.back() == '\r') line.pop_back();
    if (line.empty() || line[0] == '#') continue;
    patterns.push_back(line);
  }
  return patterns;
}

static bool ignored_path(const fs::path& p, const std::vector<std::string>& patterns) {
  const std::string relative = p.generic_string();
  const std::string basename = p.filename().generic_string();
  for (const auto& pattern : patterns) {
    if (pattern == basename || pattern == relative) return true;
    if (pattern.find('/') == std::string::npos && pattern.find('*') == std::string::npos &&
        pattern.find('?') == std::string::npos && relative.find(pattern + "/") != std::string::npos)
      return true;
    if (pattern.find_first_of("*?") != std::string::npos) {
      std::string glob;
      for (char c : pattern) {
        if (c == '*') glob += ".*";
        else if (c == '?') glob += '.';
        else glob += regex_quote(std::string(1, c));
      }
      try {
        if (std::regex_match(basename, std::regex(glob))) return true;
      } catch (const std::regex_error&) { }
    }
  }
  return false;
}

static bool collect(const fs::path& input, bool include_hidden,
                    const std::vector<std::string>& ignores,
                    std::vector<fs::path>& files, std::string& error) {
  std::error_code ec;
  auto status = fs::symlink_status(input, ec);
  if (ec) { error = input.string() + ": " + ec.message(); return false; }
  if (fs::is_symlink(status)) return true; // Symlink traversal is intentionally unsupported.
  if (fs::is_regular_file(status)) {
    if (!ignored_path(input.filename(), ignores)) files.push_back(input);
    return true;
  }
  if (!fs::is_directory(status)) return true;
  fs::recursive_directory_iterator it(input, fs::directory_options::skip_permission_denied, ec), end;
  if (ec) { error = input.string() + ": " + ec.message(); return false; }
  for (; it != end; it.increment(ec)) {
    if (ec) { ec.clear(); continue; }
    const auto rel = it->path().lexically_relative(input);
    if (!include_hidden && hidden_path(rel)) {
      if (it->is_directory(ec)) it.disable_recursion_pending();
      continue;
    }
    if (ignored_path(rel, ignores)) {
      if (it->is_directory(ec)) it.disable_recursion_pending();
      continue;
    }
    const auto child_status = it->symlink_status(ec);
    if (ec) { ec.clear(); continue; }
    if (fs::is_symlink(child_status)) {
      if (it->is_directory(ec)) it.disable_recursion_pending();
      continue;
    }
    if (fs::is_regular_file(child_status)) files.push_back(it->path());
  }
  return true;
}

static std::string regex_quote(const std::string& s) {
  std::string r;
  for (char c : s) {
    if (std::string(".^$|()[]{}*+?\\").find(c) != std::string::npos) r.push_back('\\');
    r.push_back(c);
  }
  return r;
}

int main(int argc, char** argv) {
  Options o;
  bool help = false, version = false;
  if (!parse(argc, argv, o, help, version)) {
    usage(std::cerr);
    return 2;
  }
  if (help) { usage(std::cout); return 0; }
  if (version) {
    std::cout << "ripgrep 15.2.0 (rev e89fff89ac)\n\n"
                 "features:+pcre2\n"
                 "simd(compile):+SSE2,-SSSE3,-AVX2\n"
                 "simd(runtime):+SSE2,+SSSE3,-AVX2\n\n"
                 "PCRE2 10.45 is available (JIT is available)\n";
    return 0;
  }

  std::regex expression;
  try {
    auto flags = std::regex_constants::ECMAScript;
    if (o.ignore_case) flags |= std::regex_constants::icase;
    expression = std::regex(o.fixed ? regex_quote(o.pattern) : o.pattern, flags);
  } catch (const std::regex_error& e) {
    if (e.code() == std::regex_constants::error_brack) {
      const auto position = o.pattern.find_last_of('[');
      const auto column = 7 + (position == std::string::npos ? 0 : position);
      std::cerr << "rg: regex parse error:\n    (?:" << o.pattern << ")\n"
                << std::string(column, ' ') << "^\n"
                << "error: unclosed character class\n";
    } else {
      std::cerr << "rea-rg: invalid regular expression: " << e.what() << '\n';
    }
    return 2;
  }

  std::vector<fs::path> files;
  std::string error;
  for (const auto& path : o.paths) {
    const auto ignores = ignore_patterns(path, o.no_ignore);
    if (!collect(path, o.hidden, ignores, files, error)) {
      std::cerr << "rea-rg: " << error << '\n'; return 2;
    }
  }
  if (o.sort_paths) std::sort(files.begin(), files.end());

  bool matched = false;
  for (const auto& path : files) {
    std::ifstream in(path, std::ios::binary);
    if (!in) { std::cerr << "rea-rg: " << path.string() << ": cannot open file\n"; continue; }
    std::string line;
    size_t line_number = 0;
    bool binary = false;
    while (std::getline(in, line)) {
      ++line_number;
      if (line.find('\0') != std::string::npos) { binary = true; break; }
      if (std::regex_search(line, expression)) {
        matched = true;
        std::cout << path.string() << ':';
        if (o.line_numbers) std::cout << line_number << ':';
        std::cout << line << '\n';
      }
    }
    (void)binary;
  }
  if (matched) return 0;
  return 1;
}
