# Code Preview

GitHub リポジトリ・ZIP・ローカルフォルダを読み込み、ブラウザ上でコードを編集・プレビューする実験用ツールです。

## できること

- Monaco Editor による編集、直接貼り付け、複数ファイル切り替え
- 公開 GitHub リポジトリの取り込みと再同期（追加・削除されたファイルを再取得）
- ZIP アーカイブ／ローカルフォルダの読み込み
- HTML / CSS / JavaScript の静的プレビュー
- Babel による単一ファイル JSX / TSX の変換プレビュー
- PHP / Python / C / C++ / C# / Ruby / Go / Rust などの構文色分けとソース編集（実行ランタイムは未接続）
- コンソールの文字サイズ・高さ調整
- Code Miller: https://mofu-mitsu.github.io/code-mirror/

## Next.js とビルドが必要なプロジェクト

Next.js は `package.json` や `next.config.*` を HTML として表示するのではなく、ビルド環境が必要なプロジェクトとして認識します。公開 GitHub リポジトリの場合は StackBlitz で元リポジトリを起動するリンクを案内します。Code Preview 内の編集内容は外部サービスに同期されません。

## 現在の制約

- GitHub インポートは公開リポジトリ向けです。GitHub API のレート制限の影響を受けます。
- 大きなファイルや依存関係フォルダは読み込み対象から除外されます。
- HTML 内の GitHub 由来アセットは raw URL を使い、CSS／ES module の相対パスを維持します。ZIP／フォルダ内の複雑な ES module グラフは、ローカル開発サーバーなしでは動かない場合があります。
- Vite / Next.js / npm パッケージを必要とするプロジェクトは、ブラウザ内だけでは依存関係のインストールやビルドを行いません。
- PHP / Python / C / C++ / C# / Ruby / Go / Rust はソース編集・構文色分けに対応しますが、実行にはサーバー／コンパイラ／ランタイムが必要です。
- リセットは作業中のファイルをすべて削除します。GitHub への書き戻しやプロジェクト保存機能はありません。
