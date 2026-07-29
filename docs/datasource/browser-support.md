# Datasource browser support

| Adapter   | Browser showcase                                              | Automated mode                                                                  | Required external component                     |
| --------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------- |
| Simulator | Full connect, subscribe, read/write-backed state, diagnostics | Real adapter                                                                    | None                                            |
| REST      | Configuration guidance                                        | Real adapter integration uses injected local transport outside the browser demo | CORS-enabled HTTPS service or same-origin proxy |
| WebSocket | Configuration guidance                                        | Adapter tests use injected local transport                                      | Secure WebSocket server or gateway              |
| MQTT      | Configuration guidance                                        | Adapter tests use injected client                                               | MQTT-over-WebSocket client and broker/gateway   |
| Modbus    | Configuration guidance only                                   | Node adapter tests                                                              | Backend TCP gateway or secure proxy             |
| OPC UA    | Configuration guidance only                                   | Node adapter tests and local server                                             | Backend bridge/gateway                          |

Browsers do not expose raw TCP sockets. Consequently Modbus TCP and native OPC UA cannot connect
directly from this application. MQTT requires a browser transport implementation such as secure
WebSockets. REST and WebSocket deployments must enforce origin, TLS, authentication, payload, and
timeout policies at the application boundary.

Credentials must be supplied by application-owned providers. They must never be stored in the
SCADA document, demo source, diagnostics, URL query strings, or browser storage.
