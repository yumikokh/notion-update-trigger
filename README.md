# notion-webhook

## Features

- `/api/notion`
  - `/latest` : DATABASE 内で最新のページにアクセスする
- `/api/hello`: 疎通確認用
- `/api/auth`: basic 認証

## Environment

- Typescript
- Next.js
- pnpm
- Vercel

## Command

### development

```bash
$ pnpm dev
# access to http://localhost:3000/api/xxx
```

### deploy

```bash
$ vercel # deploy as development
# or
$ vercel --prod # deploy as production
# same above
$ git push
```

### env

```bash
$ vercel add ${KEY} # vercelの環境変数に設定
$ vercel env pull # .env.local に反映される
```
