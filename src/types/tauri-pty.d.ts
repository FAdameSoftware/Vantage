// src/types/tauri-pty.d.ts
declare module "tauri-pty" {
  interface PtyOptions {
    cols: number;
    rows: number;
    cwd?: string;
  }

  interface PtyProcess {
    onData(callback: (data: string) => void): { dispose(): void };
    onExit(callback: (event: { exitCode: number }) => void): { dispose(): void };
    write(data: string): void;
    resize(cols: number, rows: number): void;
    kill(): void;
  }

  export function spawn(
    shell: string,
    args: string[],
    options: PtyOptions
  ): PtyProcess;
}
