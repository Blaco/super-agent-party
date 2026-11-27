# SAP Session Access

Electron authorizes its managed windows automatically. Browser and OpenAI-compatible API access are opt-in. Use independent, randomly generated secrets of at least 32 characters. Configure them in the parent process environment before starting SAP.

| Client | Configuration | Entry point |
| --- | --- | --- |
| Local browser | `SAP_BROWSER_ACCESS_KEY` | Open `http://localhost:<port>/` or `/chat.html` and sign in. Browser sessions last one hour. |
| LAN browser | `SAP_BROWSER_ACCESS_KEY` and `SAP_LAN_HTTPS_ORIGIN` | Open the exact configured HTTPS origin through a TLS reverse proxy on the SAP host. |
| OpenAI-compatible client | `SAP_API_ACCESS_KEY` | Use the local `/v1` base URL and send the key as a Bearer credential. The key enables model discovery and chat completions. Interactive approvals require a browser or desktop session. |

For LAN access, keep SAP bound to loopback and expose the HTTPS reverse proxy to the intended network. The proxy must preserve the public Host, set the forwarded protocol to HTTPS, support WebSocket upgrades, and replace incoming forwarding headers with its own values. Use a certificate trusted by client devices. The raw HTTP backend does not accept LAN credentials over plaintext. Set `SAP_LAN_HTTPS_ORIGIN` to the public scheme, host, and port, with no trailing slash. The same HTTPS route is available to the scoped API key when configured.

Use the browser key only for trusted people who can use the profile's settings and enabled tools. API credentials cannot access settings, approve actions, invoke MCP directly, or dispatch approval-controlled tools through chat.
