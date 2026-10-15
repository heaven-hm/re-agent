use cheat_agent_cli::run_agent_loop;
use cheat_agent_mcp::McpServer;
use cheat_agent_providers::{MockProvider, ModelResponse, ToolCall};
use serde_json::json;

#[tokio::test]
async fn test_agent_loop_two_successive_tools_and_final_response() {
    let resp1 = ModelResponse {
        content: Some("I will first inspect the system.".into()),
        tool_calls: vec![ToolCall {
            id: "call_1".into(),
            name: "process_inspect".into(),
            arguments: json!({}),
        }],
        prompt_tokens: 10,
        completion_tokens: 15,
    };

    let resp2 = ModelResponse {
        content: Some("Now reading memory at base address.".into()),
        tool_calls: vec![ToolCall {
            id: "call_2".into(),
            name: "memory_read".into(),
            arguments: json!({
                "address": "0x1000",
                "size": 4
            }),
        }],
        prompt_tokens: 20,
        completion_tokens: 25,
    };

    let resp3 = ModelResponse {
        content: Some("Successfully located target variable and verified cheat definition.".into()),
        tool_calls: vec![],
        prompt_tokens: 30,
        completion_tokens: 35,
    };

    let provider = MockProvider::new(vec![resp1, resp2, resp3]);
    let server = McpServer::new();

    let result = run_agent_loop(
        &provider,
        "mock-model",
        "Find and verify the player health pointer",
        5,
        &server,
    )
    .await;

    assert!(result.is_ok());
    let conclusion = result.unwrap();
    assert_eq!(
        conclusion,
        "Successfully located target variable and verified cheat definition."
    );
}

#[tokio::test]
async fn test_agent_loop_rejects_zero_max_iterations() {
    let provider = MockProvider::new(vec![]);
    let server = McpServer::new();

    let result = run_agent_loop(&provider, "mock-model", "Any goal", 0, &server).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_agent_loop_enforces_iteration_ceiling() {
    let looping_resp = ModelResponse {
        content: Some("Still working...".into()),
        tool_calls: vec![ToolCall {
            id: "loop_call".into(),
            name: "process_inspect".into(),
            arguments: json!({}),
        }],
        prompt_tokens: 10,
        completion_tokens: 10,
    };

    // Provide 5 repeated tool call responses
    let provider = MockProvider::new(vec![
        looping_resp.clone(),
        looping_resp.clone(),
        looping_resp.clone(),
        looping_resp.clone(),
        looping_resp,
    ]);
    let server = McpServer::new();

    // Limit to 2 iterations
    let result = run_agent_loop(&provider, "mock-model", "Looping task", 2, &server).await;
    assert!(result.is_err());
    let err = result.unwrap_err();
    assert!(err.to_string().contains("max iteration ceiling"));
}
