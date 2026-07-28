# Chord Memo

コード進行の分析を、拍単位のタイムラインとして記録・公開・再生するWebアプリです。

## 技術構成

- React / TypeScript / Vite
- Hono on Cloudflare Workers
- Cloudflare D1
- Google OAuth 2.0
- Terraform（D1）
- Web Audio API + `public/notes/24.wav`〜`95.wav`

## ローカル起動

Node.js 22以降を推奨します。

```sh
pnpm install
cp .env.example .dev.vars
pnpm db:migrate:local
pnpm dev
```

`.dev.vars` にGoogle OAuthのクライアント情報、十分に長いセッション秘密鍵、許可メールアドレスを設定します。

### Docker Composeを使う場合

先に `.dev.vars` を作成してから起動します。

```sh
cp .env.example .dev.vars
docker compose up --build
```

起動時に未適用のD1マイグレーションが自動実行され、その後に開発サーバーが立ち上がります。追加コマンドは不要です。

アプリは `http://localhost:5173` で開けます。ソースコードはコンテナへバインドされ、変更時にホットリロードされます。D1は独立したDBサーバーではなくWrangler内蔵のローカルストレージとして動作し、データはホスト側の `.wrangler/` に保存されます。

停止する場合:

```sh
docker compose down
```

依存パッケージ用ボリュームも削除して作り直す場合だけ、`docker compose down -v` を使ってください。

Google Cloud ConsoleのOAuthクライアントには、ローカル用の承認済みリダイレクトURIとして次を登録します。

```text
http://localhost:5173/auth/google/callback
```

## Cloudflareへの初回セットアップ

1. TerraformでD1を作ります。

   ```sh
   cd terraform
   terraform init
   terraform apply
   terraform output -raw d1_database_id
   ```

2. 出力されたIDを `wrangler.jsonc` の `database_id` へ設定します。
3. Google OAuthへ本番URLの `/auth/google/callback` を登録します。
4. WorkerのSecretを設定します。

   ```sh
   pnpm exec wrangler secret put GOOGLE_CLIENT_ID
   pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
   pnpm exec wrangler secret put SESSION_SECRET
   pnpm exec wrangler secret put ALLOWED_EMAILS
   ```

5. D1マイグレーションとデプロイを実行します。

   ```sh
   pnpm db:migrate:remote
   pnpm deploy
   ```

許可ユーザーは `ALLOWED_EMAILS` にカンマ区切りで設定します。ログイン済みでも一覧にないユーザーによる更新APIは403になります。曲メモの編集権限は作成者本人に限定されます。

## 品質確認

```sh
pnpm test
pnpm typecheck
pnpm build
```
