# どんぐり小児科 — ほぼワンクリック公開

1. Railwayアカウントを作成
2. このフォルダをGitHubへアップロード
3. Railway → New Project → GitHub Repo → このリポジトリ
4. PostgreSQLを追加
5. `DATABASE_URL` をPostgresの参照変数に設定
6. `APP_URL` をRailwayのPublic Domainに設定
7. `SESSION_SECRET` と `JWT_SECRET` を設定（`node scripts/generate-secrets.js`で生成可能）
8. LINE Login Channelを作成し、Channel IDとChannel Access TokenをRailway Variablesへ設定
9. `npm run setup:line` を実行してLIFFを自動追加
10. `schema.sql`をPostgresで実行
11. 管理者ハッシュを作成しadminsへ登録
12. `/admin`で管理画面、LIFF URLでスタッフ画面を確認

LINEの公式仕様上、LIFFのEndpoint URLはHTTPSである必要があります。LINEのLIFF Server APIはチャネルアクセストークンでLIFFの追加・更新が可能です。
