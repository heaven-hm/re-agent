// Independently implemented from Windows-binary runtime observations.
// Supported scope: unpaged plain UTF-8 files, exact bytes/concatenation and ENOENT.
// No upstream bat source is used. Syntax highlighting and terminal styling are unresolved.
#include <cerrno>
#include <cstring>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>
#include <unistd.h>

static int missing(const std::string &path, int code) {
  std::cerr << "\x1b[31m[bat error]\x1b[0m: '" << path << "': ";
  if (code == ENOENT) std::cerr << "File not found. (os error 2)\n";
  else std::cerr << std::strerror(code) << " (native os error " << code << ")\n";
  return 1;
}

int main(int argc, char **argv) {
  std::vector<std::string> files;
  std::string style="plain";
  bool positional=false;
  for (int i=1; i<argc; ++i) {
    std::string arg=argv[i];
    if (positional || arg=="-" || arg.empty() || arg.front()!='-') {files.push_back(arg);continue;}
    if (arg=="--") {positional=true;continue;}
    if (arg=="--version" || arg=="-V") {
      // Observed compatibility version datum, not a claim of original binary identity.
      std::cout << "bat 0.26.1 (979ba22)\n"; return 0;
    }
    if (arg=="--plain" || arg=="-p" || arg=="-pp") {style="plain";continue;}
    if (arg=="--number" || arg=="-n") {style="numbers";continue;}
    std::string value;
    const auto equals=arg.find('=');
    const auto option=arg.substr(0,equals);
    if (option=="--color" || option=="--paging" || option=="--style") {
      if (equals!=std::string::npos) value=arg.substr(equals+1);
      else if (++i<argc) value=argv[i];
      else {std::cerr << "batmac: missing option value\n";return 2;}
      if (option=="--style" && (value=="plain" || value=="numbers")) style=value;
      else if ((option=="--color" || option=="--paging") && value=="never") {}
      else {std::cerr << "batmac: unsupported rendering/paging profile\n";return 2;}
      continue;
    }
    std::cerr << "batmac: unsupported option: " << arg << '\n';return 2;
  }
  if (isatty(STDOUT_FILENO) && style!="plain") {
    std::cerr << "batmac: interactive numbered rendering is unverified\n";return 2;
  }
  auto copy=[](std::istream &input) {
    char buffer[65536];
    while (input.read(buffer,sizeof buffer) || input.gcount()) {
      std::cout.write(buffer,input.gcount());
      if (!std::cout) return false;
    }
    return !input.bad();
  };
  if (files.empty()) return copy(std::cin) ? 0 : 1;
  int outcome=0;
  for (const auto &path:files) {
    if (path=="-") {if (!copy(std::cin)) outcome=1;continue;}
    errno=0;
    std::ifstream input(path,std::ios::binary);
    if (!input) {outcome=missing(path,errno?errno:ENOENT);continue;}
    if (!copy(input)) outcome=1;
  }
  return outcome;
}
