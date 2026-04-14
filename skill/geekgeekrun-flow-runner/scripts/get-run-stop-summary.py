import argparse
import json
import os
import sqlite3
import sys


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-record-id", dest="run_record_id", type=int, default=None)
    parser.add_argument("--flow", dest="flow", default="")
    parser.add_argument("--started-at", dest="started_at", default="")
    parser.add_argument("--stopped-at", dest="stopped_at", default="")
    return parser.parse_args()


def empty_summary(run_record_id=None, flow="", query_mode="empty", started_at="", stopped_at=""):
    return {
        "success": True,
        "flow": flow,
        "runRecordId": run_record_id,
        "queryMode": query_mode,
        "startedAt": started_at or None,
        "stoppedAt": stopped_at or None,
        "viewedJobs": {"total": 0, "items": []},
        "greetedJobs": {"total": 0, "items": []},
    }


def base_item(row):
    return {
        "encryptJobId": row["encryptJobId"],
        "jobName": row["jobName"] or "",
        "positionName": row["positionName"] or "",
        "bossName": row["bossName"] or "",
        "companyName": row["companyName"] or "",
        "latestActionAt": None,
        "greetedCount": 0,
        "skippedCount": 0,
        "actions": [],
    }


def greeted_item(row):
    return {
        "encryptJobId": row["encryptJobId"],
        "jobName": row["jobName"] or "",
        "positionName": row["positionName"] or "",
        "bossName": row["bossName"] or "",
        "companyName": row["companyName"] or "",
        "latestActionAt": None,
        "greetCount": 0,
        "actions": ["已打招呼"],
    }


def update_latest(target, action_at):
    if action_at and (not target["latestActionAt"] or action_at > target["latestActionAt"]):
        target["latestActionAt"] = action_at


def normalize_dt(value):
    if not value:
        return ""
    value = str(value).strip()
    if not value:
        return ""
    if value.endswith("Z"):
        return value
    if "+" not in value and "T" in value:
        return value + "Z"
    return value


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    args = parse_args()
    started_at = normalize_dt(args.started_at)
    stopped_at = normalize_dt(args.stopped_at)

    query_mode = ""
    if args.run_record_id:
        query_mode = "runRecordId"
    elif started_at and stopped_at:
        query_mode = "timeWindow"
    else:
        print(
            json.dumps(
                empty_summary(None, args.flow, "empty", started_at, stopped_at),
                ensure_ascii=False,
                indent=2,
            )
        )
        return

    db_path = os.path.join(os.path.expanduser("~"), ".geekgeekrun", "storage", "public.db")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    if query_mode == "runRecordId":
        greeted_query = """
        SELECT
          csl.encryptJobId AS encryptJobId,
          csl.date AS actionAt,
          ji.jobName AS jobName,
          ji.positionName AS positionName,
          bi.name AS bossName,
          COALESCE(ci.name, ci.brandName, '') AS companyName
        FROM chat_startup_log csl
        LEFT JOIN job_info ji ON ji.encryptJobId = csl.encryptJobId
        LEFT JOIN boss_info bi ON bi.encryptBossId = ji.encryptBossId
        LEFT JOIN company_info ci ON ci.encryptCompanyId = ji.encryptCompanyId
        WHERE csl.autoStartupChatRecordId = ?
        ORDER BY csl.date DESC
        """
        greeted_params = (args.run_record_id,)
        viewed_query = """
        SELECT
          msl.encryptJobId AS encryptJobId,
          msl.date AS actionAt,
          ji.jobName AS jobName,
          ji.positionName AS positionName,
          bi.name AS bossName,
          COALESCE(ci.name, ci.brandName, '') AS companyName,
          msl.markReason AS markReason
        FROM mark_as_not_suit_log msl
        LEFT JOIN job_info ji ON ji.encryptJobId = msl.encryptJobId
        LEFT JOIN boss_info bi ON bi.encryptBossId = ji.encryptBossId
        LEFT JOIN company_info ci ON ci.encryptCompanyId = ji.encryptCompanyId
        WHERE msl.autoStartupChatRecordId = ?
        ORDER BY msl.date DESC
        """
        viewed_params = (args.run_record_id,)
    else:
        greeted_query = """
        SELECT
          csl.encryptJobId AS encryptJobId,
          csl.date AS actionAt,
          ji.jobName AS jobName,
          ji.positionName AS positionName,
          bi.name AS bossName,
          COALESCE(ci.name, ci.brandName, '') AS companyName
        FROM chat_startup_log csl
        LEFT JOIN job_info ji ON ji.encryptJobId = csl.encryptJobId
        LEFT JOIN boss_info bi ON bi.encryptBossId = ji.encryptBossId
        LEFT JOIN company_info ci ON ci.encryptCompanyId = ji.encryptCompanyId
        WHERE datetime(csl.date) >= datetime(?) AND datetime(csl.date) <= datetime(?)
        ORDER BY csl.date DESC
        """
        greeted_params = (started_at, stopped_at)
        viewed_query = """
        SELECT
          msl.encryptJobId AS encryptJobId,
          msl.date AS actionAt,
          ji.jobName AS jobName,
          ji.positionName AS positionName,
          bi.name AS bossName,
          COALESCE(ci.name, ci.brandName, '') AS companyName,
          msl.markReason AS markReason
        FROM mark_as_not_suit_log msl
        LEFT JOIN job_info ji ON ji.encryptJobId = msl.encryptJobId
        LEFT JOIN boss_info bi ON bi.encryptBossId = ji.encryptBossId
        LEFT JOIN company_info ci ON ci.encryptCompanyId = ji.encryptCompanyId
        WHERE datetime(msl.date) >= datetime(?) AND datetime(msl.date) <= datetime(?)
        ORDER BY msl.date DESC
        """
        viewed_params = (started_at, stopped_at)

    greeted_rows = cursor.execute(greeted_query, greeted_params).fetchall()
    viewed_skipped_rows = cursor.execute(viewed_query, viewed_params).fetchall()

    viewed_job_map = {}
    for row in greeted_rows:
        item = viewed_job_map.get(row["encryptJobId"]) or base_item(row)
        item["greetedCount"] += 1
        if "已打招呼" not in item["actions"]:
            item["actions"].append("已打招呼")
        update_latest(item, row["actionAt"])
        viewed_job_map[row["encryptJobId"]] = item

    for row in viewed_skipped_rows:
        item = viewed_job_map.get(row["encryptJobId"]) or base_item(row)
        item["skippedCount"] += 1
        if "已查看并跳过" not in item["actions"]:
            item["actions"].append("已查看并跳过")
        update_latest(item, row["actionAt"])
        viewed_job_map[row["encryptJobId"]] = item

    greeted_job_map = {}
    for row in greeted_rows:
        item = greeted_job_map.get(row["encryptJobId"]) or greeted_item(row)
        item["greetCount"] += 1
        update_latest(item, row["actionAt"])
        greeted_job_map[row["encryptJobId"]] = item

    summary = {
        "success": True,
        "flow": args.flow,
        "runRecordId": args.run_record_id if query_mode == "runRecordId" else None,
        "queryMode": query_mode,
        "startedAt": started_at or None,
        "stoppedAt": stopped_at or None,
        "viewedJobs": {
            "total": len(viewed_job_map),
            "items": sorted(
                viewed_job_map.values(),
                key=lambda item: item["latestActionAt"] or "",
                reverse=True,
            ),
        },
        "greetedJobs": {
            "total": len(greeted_job_map),
            "items": sorted(
                greeted_job_map.values(),
                key=lambda item: item["latestActionAt"] or "",
                reverse=True,
            ),
        },
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    conn.close()


if __name__ == "__main__":
    main()
