#!/usr/bin/env bash
set -euo pipefail

PRIMARY_HOST="${PRIMARY_HOST:-mariadb-primary}"
REPLICA_HOST="${REPLICA_HOST:-mariadb-replica}"
MYSQL_USER="${MYSQL_USER:-root}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-rootpassword}"
REPLICA_USER="${REPLICA_USER:-replica}"
REPLICA_PASSWORD="${REPLICA_PASSWORD:-replica}"

mysql_ready() {
  mysqladmin ping -h "$1" -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" --silent >/dev/null 2>&1
}

promote_replica() {
  echo "[failover] Promoting replica ${REPLICA_HOST} to primary"

  mysql -h "$REPLICA_HOST" -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" -e "
    SET GLOBAL read_only = 0;
    STOP SLAVE;
    RESET SLAVE ALL;
    FLUSH PRIVILEGES;
    CREATE USER IF NOT EXISTS '${REPLICA_USER}'@'%' IDENTIFIED BY '${REPLICA_PASSWORD}';
    GRANT REPLICATION SLAVE ON *.* TO '${REPLICA_USER}'@'%';
    FLUSH PRIVILEGES;
  "

  echo "[failover] Replica promoted to primary"
}

rejoin_primary_as_replica() {
  echo "[failover] Old primary recovered. Rejoining it as replica of ${REPLICA_HOST}"

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

  echo "[failover] Old primary is now rejoined as replica"
}

while true; do
  if mysql_ready "$PRIMARY_HOST"; then
    echo "[failover] Primary is healthy: ${PRIMARY_HOST}"
    sleep 10
    continue
  fi

  echo "[failover] Primary unavailable; checking replica"

  if mysql_ready "$REPLICA_HOST"; then
    promote_replica

    while true; do
      if mysql_ready "$PRIMARY_HOST"; then
        rejoin_primary_as_replica
        break
      fi
      echo "[failover] Waiting for old primary to recover before rejoining as replica"
      sleep 10
    done
  else
    echo "[failover] Replica not healthy; waiting before retry"
  fi

  sleep 10
 done

