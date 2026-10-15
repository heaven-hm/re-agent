use async_trait::async_trait;
use cheat_agent_core::{CheatError, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    #[serde(default)]
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<Value>>,
}

impl ChatMessage {
    pub fn system(content: impl Into<String>) -> Self {
        Self {
            role: "system".into(),
            content: content.into(),
            tool_call_id: None,
            name: None,
            tool_calls: None,
        }
    }

    pub fn user(content: impl Into<String>) -> Self {
        Self {
            role: "user".into(),
            content: content.into(),
            tool_call_id: None,
            name: None,
            tool_calls: None,
        }
    }

    pub fn assistant(content: impl Into<String>, tool_calls: Option<Vec<Value>>) -> Self {
        Self {
            role: "assistant".into(),
            content: content.into(),
            tool_call_id: None,
            name: None,
            tool_calls,
        }
    }

    pub fn tool(tool_call_id: impl Into<String>, name: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            role: "tool".into(),
            content: content.into(),
            tool_call_id: Some(tool_call_id.into()),
            name: Some(name.into()),
            tool_calls: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelResponse {
    pub content: Option<String>,
    pub tool_calls: Vec<ToolCall>,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
}

#[async_trait]
pub trait LlmProvider: Send + Sync {
    async fn chat_complete(
        &self,
        model: &str,
        messages: &[ChatMessage],
        tools: &[Value],
    ) -> Result<ModelResponse>;
}

#[derive(Default)]
pub struct MockProvider {
    responses: std::sync::Mutex<std::collections::VecDeque<ModelResponse>>,
}

impl MockProvider {
    pub fn new(responses: Vec<ModelResponse>) -> Self {
        Self {
            responses: std::sync::Mutex::new(responses.into()),
        }
    }
}

#[async_trait]
impl LlmProvider for MockProvider {
    async fn chat_complete(
        &self,
        _model: &str,
        _messages: &[ChatMessage],
        _tools: &[Value],
    ) -> Result<ModelResponse> {
        let mut guard = self.responses.lock().map_err(|e| CheatError::Internal(e.to_string()))?;
        guard.pop_front().ok_or_else(|| {
            CheatError::Internal("MockProvider exhausted all scripted responses".to_string())
        })
    }
}

pub struct OpenAiProvider {
    client: Client,
    api_key: String,
    base_url: String,
}

impl OpenAiProvider {
    pub fn new(api_key: String, base_url: Option<String>) -> Self {
        Self {
            client: Client::new(),
            api_key,
            base_url: base_url.unwrap_or_else(|| "https://api.openai.com/v1".to_string()),
        }
    }
}

#[async_trait]
impl LlmProvider for OpenAiProvider {
    async fn chat_complete(
        &self,
        model: &str,
        messages: &[ChatMessage],
        tools: &[Value],
    ) -> Result<ModelResponse> {
        let url = format!("{}/chat/completions", self.base_url);

        let mut body = serde_json::json!({
            "model": model,
            "messages": messages,
        });

        if !tools.is_empty() {
            body["tools"] = serde_json::json!(tools);
        }

        let resp = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&body)
            .send()
            .await
            .map_err(|e| CheatError::Internal(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err_text = resp.text().await.unwrap_or_default();
            return Err(CheatError::Internal(format!(
                "OpenAI API error {}: {}",
                status, err_text
            )));
        }

        let val: Value = resp.json().await.map_err(|e| CheatError::Internal(e.to_string()))?;
        let choice = &val["choices"][0]["message"];
        let content = choice["content"].as_str().map(|s| s.to_string());

        let mut tool_calls = Vec::new();
        if let Some(calls) = choice["tool_calls"].as_array() {
            for c in calls {
                let id = c["id"].as_str().unwrap_or_default().to_string();
                let name = c["function"]["name"].as_str().unwrap_or_default().to_string();
                let args_str = c["function"]["arguments"].as_str().unwrap_or("{}");
                let arguments: Value = serde_json::from_str(args_str).unwrap_or(Value::Null);
                tool_calls.push(ToolCall { id, name, arguments });
            }
        }

        let prompt_tokens = val["usage"]["prompt_tokens"].as_u64().unwrap_or(0) as u32;
        let completion_tokens = val["usage"]["completion_tokens"].as_u64().unwrap_or(0) as u32;

        Ok(ModelResponse {
            content,
            tool_calls,
            prompt_tokens,
            completion_tokens,
        })
    }
}

pub struct OllamaProvider {
    client: Client,
    host: String,
}

impl OllamaProvider {
    pub fn new(host: Option<String>) -> Self {
        Self {
            client: Client::new(),
            host: host.unwrap_or_else(|| "http://127.0.0.1:11434".to_string()),
        }
    }
}

#[async_trait]
impl LlmProvider for OllamaProvider {
    async fn chat_complete(
        &self,
        model: &str,
        messages: &[ChatMessage],
        tools: &[Value],
    ) -> Result<ModelResponse> {
        let url = format!("{}/api/chat", self.host);

        let mut body = serde_json::json!({
            "model": model,
            "messages": messages,
            "stream": false,
        });

        if !tools.is_empty() {
            body["tools"] = serde_json::json!(tools);
        }

        let resp = self
            .client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| CheatError::Internal(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err_text = resp.text().await.unwrap_or_default();
            return Err(CheatError::Internal(format!(
                "Ollama error {}: {}",
                status, err_text
            )));
        }

        let val: Value = resp.json().await.map_err(|e| CheatError::Internal(e.to_string()))?;
        let msg = &val["message"];
        let content = msg["content"].as_str().map(|s| s.to_string());

        let mut tool_calls = Vec::new();
        if let Some(calls) = msg["tool_calls"].as_array() {
            for c in calls {
                let name = c["function"]["name"].as_str().unwrap_or_default().to_string();
                let arguments = c["function"]["arguments"].clone();
                tool_calls.push(ToolCall {
                    id: format!("call_{}", tool_calls.len()),
                    name,
                    arguments,
                });
            }
        }

        Ok(ModelResponse {
            content,
            tool_calls,
            prompt_tokens: 0,
            completion_tokens: 0,
        })
    }
}
