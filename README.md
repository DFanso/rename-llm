# Rename LLM CLI

This tool uses an OpenRouter LLM (defaulting to a free model) to rename files in a directory based on a natural language prompt.

## Setup

1.  Install dependencies:
    ```bash
    npm install
    ```
2.  Create a `.env` file in the root directory and add your OpenRouter API key:
    ```env
    OPENROUTER_API_KEY=your_api_key_here
    OPENROUTER_MODEL=google/gemini-2.0-flash-exp:free
    ```
    (You can skip `OPENROUTER_MODEL` to use the default free model).

## Global Installation (Local)

To use this tool from anywhere on your computer:

1.  Build the project:
    ```bash
    npm run build
    ```

2.  Link the package globally:
    ```bash
    npm link
    ```

3.  Now you can run `rename-llm` in any directory:
    ```bash
    rename-llm --dir ./my-photos --prompt "Rename these based on their content"
    ```

## Usage

Run the tool using `ts-node` (for development) or build it.

### Using `npm start`

```bash
npm start -- --dir ./test_files --prompt "Rename text files to be snake_case and add '_backup' suffix"
```
OR
```bash
npx tsx src/index.ts --dir ./test_files --prompt "Rename text files to be snake_case and add '_backup' suffix"
```

### Arguments

-   `--dir`, `-d`: The directory containing files to rename (default: current directory).
-   `--prompt`, `-p`: The instruction for how to rename the files.

## Example

Files:
- `document_v1_final.txt`
- `IMG_20210901.jpg`

Prompt: "Change all filenames to lowercase"

Result:
- `document_v1_final.txt` (unchanged)
- `img_20210901.jpg`

