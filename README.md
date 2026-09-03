# どんぐり小児科 出退勤アプリ — 公開版 v2

Railway + PostgreSQL + LINE LIFF を前提にした「サーバー未所有」からの公開用パッケージです。

## 最短公開手順

### 1. Railwayにアカウントを作成
Railwayで新しいProjectを作成し、このフォルダをGitHub経由またはRailway CLIでデプロイします。

CLIの場合:
```bash
railway login
railway init
railway up
```

### 2. PostgreSQLを追加
Railway ProjectにPostgreSQLを追加します。
Webサービスの Variables で `DATABASE_URL` をPostgresの参照変数にします。

### 3. Web公開
Webサービスの Networking からPublic Domainを生成します。
生成された `https://...` を `APP_URL` に設定します。

### 4. DB初期化
RailwayのPostgres接続先で `schema.sql` を実行します。

### 5. 管理者パスワード
```bash
npm run hash-password -- '強いパスワード'
```
表示されたハッシュを使って `admins` テーブルへ登録します。
例:
```sql
INSERT INTO admins(email, password_hash)
VALUES ('admin@example.com', 'ここにハッシュ');
```

### 6. LINE LIFF
LINE DevelopersでLINE Login channelを作成し、Channel Access Tokenを発行します。
その値を `LINE_CHANNEL_ACCESS_TOKEN` に登録します。
`APP_URL` がHTTPSになった後、以下を実行するとLIFFアプリを自動追加/更新します。

```bash
npm run setup:line
```

成功すると:
`https://liff.line.me/{LIFF_ID}`

### 7. Railway Variables
最低限:
- NODE_ENV=production
- APP_URL=https://...
- SESSION_SECRET=長いランダム値
- JWT_SECRET=別の長いランダム値
- DATABASE_URL=Railway Postgres参照
- LINE_CHANNEL_ID=LINE Login Channel ID
- LINE_CHANNEL_ACCESS_TOKEN=秘密値
- LINE_LIFF_ID=setup後のLIFF ID

## セキュリティ
秘密鍵・LINEアクセストークン・管理者パスワードをチャットへ貼らないでください。
Railway Variablesまたはローカル`.env`で管理してください。

## LINE設定について
LINEのLIFF Server APIでLIFFアプリの追加/更新を自動化しています。
Endpoint URLはHTTPS必須です。

## 重要
このパッケージは「公開可能な土台」です。実運用開始前に、医院の個人情報・勤怠データの運用ルール、バックアップ、権限管理、ログ監視、利用規約/プライバシー対応を確認してください。
