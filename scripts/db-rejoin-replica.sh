#!/usr/bin/env bash
set -euo pipefail

PRIMARY_HOST="${PRIMARY_HOST:-mariadb-primary}"
REPLICA_HOST="${REPLICA_HOST:-mariadb-replica}"
MYSQL_USER="${MYSQL_USER:-root}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-rootpassword}"
REPLICA_USER="${REPLICA_USER:-replica}"
REPLICA_PASSWORD="${REPLICA_PASSWORD:-replica}"

mysql -h "$PRIMARY_HOST" -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" -e "
  STOP SLAVE;
  RESET SLAVE ALL;
  CHANGE MASTER TO
    MASTER_HOST='${REPLICA_HOST}',
    MASTER_USER='${REPLICA_USER}',
    MASTER_PASSWORD='${REPLICA_PASSWORD}',
    MASTER_USE_GTID = slave_pos;
  START SLAVE;
"

echo "[rejoin] primary remains as replica of ${REPLICA_HOST}"
