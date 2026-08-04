# @pipeworx/datacite

DataCite MCP — DOIs for research datasets, software, samples (not papers — see crossref). No auth.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

- `search_dois(query?, resource_type?, year?, publisher?, affiliation?, page_size?, page?)`
- `get_doi(doi)`
- `list_repositories(query?, page_size?, page?)`

## Data source

`https://api.datacite.org` — public JSON:API.

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "datacite": {
      "url": "https://gateway.pipeworx.io/datacite/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Datacite data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
