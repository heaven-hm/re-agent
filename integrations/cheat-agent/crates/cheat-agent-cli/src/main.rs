use clap::{Parser, Subcommand};
use cheat_agent_core::definition::*;
use cheat_agent_core::DataType;
use cheat_agent_ffi::{MemoryScanner, ProcessBackend};
use cheat_agent_generators::TrainerGenerator;
use cheat_agent_mcp::McpServer;
use cheat_agent_providers::{LlmProvider, OllamaProvider, OpenAiProvider};
use cheat_agent_verifier::VerificationEngine;
use std::fs;
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "cheat-agent", version = "0.1.0", about = "Cross-platform autonomous AI cheat agent & verified trainer generator")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Run stdio Model Context Protocol (MCP) server for Claude Code and Codex
    Mcp,

    /// Run standalone autonomous AI agent loop
    Run {
        #[arg(long, default_value = "ollama")]
        provider: String,

        #[arg(long, default_value = "qwen2.5-coder:32b")]
        model: String,

        #[arg(long)]
        goal: String,

        #[arg(long, default_value_t = 20)]
        max_iterations: usize,
    },

    /// Scan process memory directly
    Scan {
        #[arg(long)]
        pid: u32,

        #[arg(long)]
        exact: Option<u32>,

        #[arg(long)]
        aob: Option<String>,

        #[arg(long, default_value = "uint32")]
        data_type: String,
    },

    /// Verify a cheat definition with restart testing
    Verify {
        #[arg(long)]
        cheat: PathBuf,

        #[arg(long)]
        target_command: String,
    },

    /// Generate standalone C++, Rust, and Cheat Engine trainers
    Generate {
        #[arg(long)]
        cheat: PathBuf,

        #[arg(long, default_value = "cpp")]
        lang: String,

        #[arg(long)]
        output: Option<PathBuf>,
    },
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Mcp => {
            let server = McpServer::new();
            server.run_stdio()?;
        }
        Commands::Scan { pid, exact, aob, data_type: _ } => {
            println!("[+] Attaching to PID {}...", pid);
            let backend = ProcessBackend::new(pid)?;
            let mut scanner = MemoryScanner::new(&backend)?;

            if let Some(val) = exact {
                let bytes = val.to_ne_bytes();
                scanner.first_scan(DataType::Uint32, cheat_agent_core::ScanMode::Exact, Some(&bytes), None)?;
                let count = scanner.match_count();
                println!("[+] Found {} matches for exact value {}", count, val);
                let matches = scanner.get_matches(10)?;
                for addr in matches {
                    println!("    0x{:X}", addr);
                }
            } else if let Some(pat) = aob {
                scanner.scan_aob(&pat)?;
                let count = scanner.match_count();
                println!("[+] Found {} matches for AoB pattern '{}'", count, pat);
                let matches = scanner.get_matches(10)?;
                for addr in matches {
                    println!("    0x{:X}", addr);
                }
            }
        }
        Commands::Verify { cheat, target_command } => {
            let content = fs::read_to_string(&cheat)?;
            let mut def: CheatDefinition = serde_json::from_str(&content)?;

            println!("[+] Verifying cheat '{}' against '{}'...", def.name, target_command);
            let report = VerificationEngine::verify_with_restart(&mut def, &target_command)?;

            println!("[+] Verification Outcome: {} (unproven stages are not passed)", report.overall_status);
            println!("    Memory Write:        {}", if report.stages.memory_write { "PASSED" } else { "FAILED" });
            println!("    Game Behavior:       {}", if report.stages.game_behavior { "PASSED" } else { "FAILED" });
            println!("    Restart Persistence: {}", if report.stages.restart_persistence { "PASSED" } else { "FAILED" });
            println!("    Trainer Compile:     {}", if report.stages.trainer_compilation { "PASSED" } else { "FAILED" });
            println!("    Trainer Execution:   {}", if report.stages.trainer_execution { "PASSED" } else { "FAILED" });

            let updated_json = serde_json::to_string_pretty(&def)?;
            fs::write(&cheat, updated_json)?;
            println!("[+] Updated cheat definition saved to {:?}", cheat);
            if report.overall_status != "PASSED" {
                eprintln!("[!] Cheat not verified; exiting with status 2");
                std::process::exit(2);
            }
        }
        Commands::Generate { cheat, lang, output } => {
            let content = fs::read_to_string(&cheat)?;
            let def: CheatDefinition = serde_json::from_str(&content)?;

            let code = match lang.as_str() {
                "cpp" => TrainerGenerator::generate_cpp(&def)?,
                "rust" => TrainerGenerator::generate_rust(&def)?,
                "cheat_engine" | "ct" => TrainerGenerator::generate_cheat_engine_table(&def)?,
                _ => {
                    eprintln!("Unsupported language: {}. Choose 'cpp', 'rust', or 'cheat_engine'", lang);
                    std::process::exit(1);
                }
            };

            if let Some(out_path) = output {
                fs::write(&out_path, &code)?;
                println!("[+] Generated {} trainer written to {:?}", lang, out_path);
            } else {
                println!("{}", code);
            }
        }
        Commands::Run { provider, model, goal, max_iterations } => {
            if max_iterations == 0 {
                return Err("max-iterations must be greater than zero".into());
            }
            println!("[+] Starting Standalone AI Agent (Mode B)");
            println!("    Provider: {}", provider);
            println!("    Model:    {}", model);
            println!("    Goal:     {}", goal);

            let provider_box: Box<dyn LlmProvider> = match provider.as_str() {
                "openai" => {
                    let key = std::env::var("OPENAI_API_KEY").unwrap_or_default();
                    Box::new(OpenAiProvider::new(key, None))
                }
                "ollama" => {
                    let host = std::env::var("OLLAMA_HOST").ok();
                    Box::new(OllamaProvider::new(host))
                }
                _ => {
                    eprintln!("Unsupported provider: {}. Choose 'openai' or 'ollama'", provider);
                    std::process::exit(1);
                }
            };

            let mcp_server = McpServer::new();
            match cheat_agent_cli::run_agent_loop(
                provider_box.as_ref(),
                &model,
                &goal,
                max_iterations,
                &mcp_server,
            )
            .await
            {
                Ok(conclusion) => {
                    println!("\n[+] Autonomous Agent Completed Successfully:\n{}", conclusion);
                }
                Err(e) => {
                    eprintln!("[!] Agent loop failed: {}", e);
                    return Err(Box::<dyn std::error::Error>::from(e));
                }
            }
        }
    }

    Ok(())
}
