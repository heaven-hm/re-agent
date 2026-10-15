// Independent native experiment implementation; candidate behavior is documented
// separately and is UNVERIFIED against fd. This is not a completed fd port.
#include <algorithm>
#include <cctype>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <regex>
#include <set>
#include <string>
#include <vector>

namespace fs = std::filesystem;
struct Options {
  bool hidden=false, noIgnore=false, insensitive=false, sensitive=false, glob=false, fullPath=false;
  bool follow=false, absolute=false, nullTerminator=false;
  int maxDepth=-1;
  std::string types, pattern=".";
  std::vector<std::string> extensions, roots, exclusions;
};
static std::string lower(std::string value) {
  for (char &ch:value) ch=static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
  return value;
}
static std::string globRegex(const std::string &value) {
  std::string result="^";
  bool characterClass=false;
  for (char ch:value) {
    if (ch=='[') {characterClass=true;result+=ch;}
    else if (ch==']') {characterClass=false;result+=ch;}
    else if (characterClass) result+=ch;
    else if (ch=='*') result+=".*";
    else if (ch=='?') result+='.';
    else {if (std::string(".\\+^$(){}|").find(ch)!=std::string::npos) result+='\\';result+=ch;}
  }
  return result+"$";
}
struct Rule {fs::path base;std::string pattern;bool directoryOnly=false;bool negated=false;};
static void readIgnore(const fs::path &directory,const std::string &name,std::vector<Rule> &rules) {
  std::ifstream stream(directory/name);
  std::string line;
  while (std::getline(stream,line)) {
    if (!line.empty() && line.back()=='\r') line.pop_back();
    if (line.empty() || line[0]=='#') continue;
    Rule rule{directory,line,false,false};
    if (rule.pattern[0]=='!') {rule.negated=true;rule.pattern.erase(0,1);}
    if (!rule.pattern.empty() && rule.pattern.back()=='/') {rule.directoryOnly=true;rule.pattern.pop_back();}
    if (!rule.pattern.empty()) rules.push_back(rule);
  }
}
static bool ignored(const fs::path &path,bool isDirectory,const std::vector<Rule> &rules) {
  bool result=false;
  for (const auto &rule:rules) {
    if (rule.directoryOnly && !isDirectory) continue;
    auto relative=path.lexically_relative(rule.base).generic_string();
    if (relative.empty() || relative.rfind("../",0)==0) continue;
    auto pattern=rule.pattern;
    bool anchored=pattern[0]=='/';
    if (anchored) pattern.erase(0,1);
    const auto candidate=anchored || pattern.find('/')!=std::string::npos ? relative:path.filename().string();
    try {if (std::regex_match(candidate,std::regex(globRegex(pattern)))) result=!rule.negated;}
    catch (const std::regex_error &) { /* Unsupported ignore rule is not proof of full ignore parity. */ }
  }
  return result;
}
static bool parse(int argc,char **argv,Options &options,std::string &error) {
  bool positionalOnly=false;
  std::vector<std::string> positional;
  for (int i=1;i<argc;i++) {
    std::string arg=argv[i];
    auto take=[&]() -> std::string {if (i+1>=argc) {error="missing value for "+arg;return "";}return argv[++i];};
    if (!positionalOnly && arg=="--") {positionalOnly=true;continue;}
    if (positionalOnly || arg.empty() || arg[0]!='-') {positional.push_back(arg);continue;}
    if (arg=="--hidden" || arg=="-H") options.hidden=true;
    else if (arg=="--no-ignore" || arg=="-I") options.noIgnore=true;
    else if (arg=="-u" || arg=="--unrestricted") {if(options.noIgnore)options.hidden=true;else options.noIgnore=true;}
    else if (arg=="--ignore-case" || arg=="-i") options.insensitive=true;
    else if (arg=="--case-sensitive" || arg=="-s") options.sensitive=true;
    else if (arg=="--glob" || arg=="-g") options.glob=true;
    else if (arg=="--full-path" || arg=="-p") options.fullPath=true;
    else if (arg=="--follow" || arg=="-L") options.follow=true;
    else if (arg=="--absolute-path" || arg=="-a") options.absolute=true;
    else if (arg=="--print0" || arg=="-0") options.nullTerminator=true;
    else if (arg=="--extension" || arg=="-e") {auto value=take();if(!value.empty() && value[0]=='.')value.erase(0,1);options.extensions.push_back(lower(value));}
    else if (arg=="--type" || arg=="-t") {auto value=take();if(value.size()!=1 || std::string("fdl").find(value)==std::string::npos)error="unsupported type: "+value;else options.types+=value;}
    else if (arg=="--exclude" || arg=="-E") options.exclusions.push_back(take());
    else if (arg=="--max-depth" || arg=="-d") {auto value=take();try {size_t n=0;options.maxDepth=std::stoi(value,&n);if(n!=value.size() || options.maxDepth<0)error="invalid depth";}catch(...){error="invalid depth";}}
    else if (arg=="--color" || arg=="-c") {auto value=take();if(value!="never")error="only --color never supported";}
    else if (arg=="--threads" || arg=="-j") {auto value=take();if(value!="1")error="only deterministic --threads 1 supported";}
    else {error="unsupported option: "+arg;return false;}
    if (!error.empty()) return false;
  }
  if (!positional.empty()) options.pattern=positional[0];
  options.roots.assign(positional.begin()+(positional.empty()?0:1),positional.end());
  if(options.roots.empty())options.roots.push_back(".");
  return error.empty();
}
class Walker {
  const Options &options;
  const std::regex pattern;
  std::vector<std::string> results;
  std::set<std::string> visited;
  bool ioFailure=false;
  bool repository(const fs::path &root) {
    auto directory=fs::absolute(root);
    while(true) {std::error_code ec;if(fs::exists(directory/".git",ec))return true;if(directory==directory.root_path())break;directory=directory.parent_path();}
    return false;
  }
  void walk(const fs::path &directory,const fs::path &root,int depth,std::vector<Rule> rules,bool git) {
    if (options.maxDepth>=0 && depth>options.maxDepth) return;
    if (!options.noIgnore) {readIgnore(directory,".ignore",rules);readIgnore(directory,".fdignore",rules);if(git)readIgnore(directory,".gitignore",rules);}
    std::error_code ec;
    std::vector<fs::directory_entry> entries;
    for(fs::directory_iterator iterator(directory,ec),end;!ec && iterator!=end;iterator.increment(ec))entries.push_back(*iterator);
    if(ec) {ioFailure=true;return;}
    std::sort(entries.begin(),entries.end(),[](const auto &a,const auto &b){return a.path().filename().string()<b.path().filename().string();});
    for(const auto &entry:entries) {
      auto path=entry.path();auto name=path.filename().string();
      if(!options.hidden && !name.empty() && name[0]=='.')continue;
      std::error_code statusError;auto status=entry.symlink_status(statusError);
      if(statusError){ioFailure=true;continue;}
      bool symlink=fs::is_symlink(status), directoryEntry=fs::is_directory(status);
      auto relative=path.lexically_relative(root).generic_string();
      bool excluded=false;
      for(const auto &exclude:options.exclusions)try {if(std::regex_match(name,std::regex(globRegex(exclude))))excluded=true;}catch(const std::regex_error&){}
      if(excluded || (!options.noIgnore && ignored(path,directoryEntry,rules)))continue;
      bool typeMatch=options.types.empty() || (directoryEntry && options.types.find('d')!=std::string::npos) ||
        (symlink && options.types.find('l')!=std::string::npos) || (fs::is_regular_file(status) && options.types.find('f')!=std::string::npos);
      bool extensionMatch=options.extensions.empty();
      for(const auto &extension:options.extensions)if(lower(path.extension().string())=="."+extension)extensionMatch=true;
      auto candidate=options.fullPath?path.generic_string():name;
      bool match=options.glob?std::regex_match(candidate,pattern):std::regex_search(candidate,pattern);
      if(typeMatch && extensionMatch && match) {
        auto display=options.absolute?fs::absolute(path).lexically_normal().generic_string():path.lexically_normal().generic_string();
        if(directoryEntry)display+='/';
        results.push_back(display);
      }
      if(symlink && options.follow) {directoryEntry=entry.is_directory(statusError);if(statusError){ioFailure=true;continue;}}
      if(directoryEntry) {
        auto identity=fs::weakly_canonical(path,statusError).generic_string();
        if(!statusError && visited.insert(identity).second)walk(path,root,depth+1,rules,git);
      }
    }
  }
public:
  Walker(const Options &value,std::regex expression):options(value),pattern(std::move(expression)){}
  int run() {
    for(const auto &rootString:options.roots) {
      fs::path root=rootString;std::error_code ec;
      if(!fs::is_directory(root,ec)) {std::cerr<<"fdmac: search root is not a directory: "<<rootString<<'\n';ioFailure=true;continue;}
      visited.insert(fs::weakly_canonical(root,ec).generic_string());
      walk(root,root,1,{},repository(root));
    }
    std::sort(results.begin(),results.end());
    for(const auto &line:results)std::cout<<line<<(options.nullTerminator?'\0':'\n');
    return ioFailure?1:0;
  }
};
int main(int argc,char **argv) {
  Options options;std::string error;
  if(!parse(argc,argv,options,error)){std::cerr<<"fdmac: "<<error<<'\n';return 2;}
  bool smartCase=std::any_of(options.pattern.begin(),options.pattern.end(),[](unsigned char ch){return std::isupper(ch)!=0;});
  auto flags=std::regex_constants::ECMAScript;
  if(options.insensitive || (!options.sensitive && !smartCase))flags|=std::regex_constants::icase;
  try {return Walker(options,std::regex(options.glob?globRegex(options.pattern):options.pattern,flags)).run();}
  catch(const std::regex_error &){std::cerr<<"fdmac: invalid regular expression\n";return 2;}
}
