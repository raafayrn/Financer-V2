# Scripts de manutenção

Utilitários de linha de comando para administração do banco. Rodar de dentro de `server/`, com as variáveis de ambiente carregadas (`DATABASE_URL` etc.):

```bash
node scripts/list-users.js
node scripts/set-password.js <email> <nova-senha>
```

- **list-users.js** — lista id, nome e e-mail de todos os usuários cadastrados.
- **set-password.js** — redefine a senha de um usuário existente (útil quando alguém esquece a senha e não há fluxo de "esqueci minha senha" no app).

Dentro do container Docker: `docker exec financerv2-server-1 node scripts/set-password.js <email> <nova-senha>`.
