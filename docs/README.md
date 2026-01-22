# Jekyll Documentation Site

This directory contains the Jekyll documentation site for the UCP SFCC Cartridge.

## Setup

1. Install Ruby and Bundler (if not already installed)
2. Install dependencies:
   ```bash
   bundle install
   ```

## Development

Run the Jekyll development server:

```bash
bundle exec jekyll serve
```

The site will be available at `http://localhost:4000`

## Building

Build the static site:

```bash
bundle exec jekyll build
```

The generated site will be in the `_site` directory.

## Structure

- `_config.yml` - Jekyll configuration
- `_layouts/` - HTML layout templates
- `assets/` - CSS, JavaScript, and other static assets
- `*.md` - Markdown documentation pages
- `index.md` - Home page

## Deployment

The `_site` directory contains the static site that can be deployed to any static hosting service (GitHub Pages, Netlify, Vercel, etc.).

