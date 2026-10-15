use cheat_agent_core::{CheatError, Result};
use cheat_agent_mcp::McpServer;
use cheat_agent_providers::{ChatMessage, LlmProvider};

pub async fn run_agent_loop(
    provider: &dyn LlmProvider,
    model: &str,
    goal: &str,
    max_iterations: usize,
    mcp_server: &McpServer,
) -> Result<String> {
    if max_iterations == 0 {
        return Err(CheatError::InvalidArgument(
            "max_iterations must be greater than 0".into(),
        ));
    }

    let tools = McpServer::get_tools_list();
    let tools_vec = tools.as_array().cloned().unwrap_or_default();

    let mut messages = vec![
        ChatMessage::system(
            "You are Cheat Agent, an expert cross-platform reverse-engineering and trainer-generation agent. Use the available tools to inspect memory, find values, resolve pointer chains, and generate verified trainers.",
        ),
        ChatMessage::user(goal),
    ];

    let max_context_messages = 50;
    let mut iterations = 0;

    while iterations < max_iterations {
        iterations += 1;
        println!("[+] Iteration {}/{}: Calling model...", iterations, max_iterations);

        let resp = provider.chat_complete(model, &messages, &tools_vec).await?;

        if let Some(ref text) = resp.content {
            println!("\n[Agent]:\n{}", text);
        }

        if resp.tool_calls.is_empty() {
            println!("[+] Goal completed at iteration {}.", iterations);
            return Ok(resp.content.unwrap_or_else(|| "Goal completed".to_string()));
        }

        let mut tool_calls_json = Vec::new();
        for call in &resp.tool_calls {
            tool_calls_json.push(serde_json::json!({
                "id": call.id,
                "type": "function",
                "function": {
                    "name": call.name,
                    "arguments": call.arguments.to_string(),
                }
            }));
        }

        messages.push(ChatMessage::assistant(
            resp.content.unwrap_or_default(),
            Some(tool_calls_json),
        ));

        for call in &resp.tool_calls {
            println!("  -> Executing Tool: {}({})", call.name, call.arguments);
            let tool_output = match mcp_server.handle_tool_call(&call.name, &call.arguments) {
                Ok(val) => val.to_string(),
                Err(err) => {
                    eprintln!("    [!] Tool Execution Error: {}", err);
                    serde_json::json!({
                        "error": err.to_string()
                    })
                    .to_string()
                }
            };
            messages.push(ChatMessage::tool(&call.id, &call.name, tool_output));
        }

        if messages.len() > max_context_messages {
            let overflow = messages.len() - max_context_messages;
            messages.drain(1..=overflow);
        }
    }

    Err(CheatError::Internal(format!(
        "Autonomous agent loop reached max iteration ceiling ({}) without concluding",
        max_iterations
    )))
}
