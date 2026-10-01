# Housekeeping on the production host

Two caps that keep the disk from filling up again (on 2026-10-01 it was at 78 %,
63 GB of it Docker build cache and stale images, 3.6 GB the uncapped journal).

| File | Installed as | What it does |
|---|---|---|
| `journald-andrey.conf` | `/etc/systemd/journald.conf.d/andrey.conf` | caps the systemd journal at 1 GB |
| `docker-prune.service` + `.timer` | `/etc/systemd/system/` | weekly (Sun 05:00): `docker builder prune -a` and `docker image prune -a --filter until=168h` — only what no container uses; volumes untouched |

Install or update (from the repo root):

```bash
H=root@85.192.26.113
ssh $H 'mkdir -p /etc/systemd/journald.conf.d'
scp ops/housekeeping/journald-andrey.conf $H:/etc/systemd/journald.conf.d/andrey.conf
scp ops/housekeeping/docker-prune.service ops/housekeeping/docker-prune.timer $H:/etc/systemd/system/
ssh $H 'systemctl restart systemd-journald && systemctl daemon-reload && systemctl enable --now docker-prune.timer'
```

Check:

```bash
ssh root@85.192.26.113 'journalctl --disk-usage; systemctl list-timers docker-prune --all'
```

Run a prune now: `ssh root@85.192.26.113 'systemctl start docker-prune.service'`.
