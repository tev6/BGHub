#!/usr/bin/env python3
"""
BG Hub 数据库同步脚本
功能：
  - 从服务器下载数据库文件到本地
  - 替换本地数据库文件
  - 同步 uploads 目录
作者：BG Hub Dev Team
使用方法：
    python sync_db.py --host your-server.com
    python sync_db.py --host your-server.com --path /root/mywebsite/BGHub
    python sync_db.py --host your-server.com --uploads
    python sync_db.py --host your-server.com --uploads-only
    或按提示输入
"""

import os
import sys
import argparse
import subprocess
import shutil
from datetime import datetime


def log_step(message):
    print(f"[*] {message}")


def log_success(message):
    print(f"[+] {message}")


def log_error(message):
    print(f"[-] {message}")


def log_warning(message):
    print(f"[!] {message}")


def download_database(host, user, remote_path, local_path):
    """从服务器下载数据库文件"""
    remote_db_path = f"{user}@{host}:{remote_path}/data/bigz-hub-mvp.db"
    local_temp_path = os.path.join(os.path.dirname(local_path), "bigz-hub-mvp.db.downloading")

    log_step(f"正在从服务器下载数据库...")

    if not shutil.which("scp"):
        log_error("SCP 工具未找到，请确保 OpenSSH 已安装")
        return False

    try:
        result = subprocess.run(
            ["scp", "-o", "StrictHostKeyChecking=no", remote_db_path, local_temp_path],
            capture_output=True,
            text=True,
            timeout=300
        )

        if result.returncode == 0:
            log_success("数据库下载成功!")
            return local_temp_path
        else:
            log_error(f"下载失败: {result.stderr}")
            return False
    except subprocess.TimeoutExpired:
        log_error("下载超时，请检查网络连接")
        return False
    except Exception as e:
        log_error(f"下载出错: {e}")
        return False


def backup_local_db(local_path):
    """备份本地数据库"""
    if not os.path.exists(local_path):
        log_warning("本地数据库文件不存在，跳过备份")
        return True

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = f"{local_path}.backup_{timestamp}"

    try:
        shutil.copy2(local_path, backup_path)
        log_success(f"已备份本地数据库到: {backup_path}")
        return True
    except Exception as e:
        log_error(f"备份失败: {e}")
        return False


def replace_local_db(temp_path, local_path):
    """替换本地数据库"""
    try:
        if os.path.exists(local_path):
            os.remove(local_path)
        shutil.move(temp_path, local_path)
        log_success(f"已替换本地数据库: {local_path}")
        return True
    except Exception as e:
        log_error(f"替换失败: {e}")
        return False


def download_uploads(host, user, remote_path, local_path):
    """从服务器同步 uploads 目录"""
    remote_uploads_path = f"{user}@{host}:{remote_path}/public/uploads/"
    local_uploads_path = os.path.join(local_path, "public", "uploads")

    log_step("正在同步 uploads 目录...")

    os.makedirs(local_uploads_path, exist_ok=True)

    if shutil.which("rsync"):
        try:
            result = subprocess.run(
                ["rsync", "-avz", "-e", "ssh -o StrictHostKeyChecking=no",
                 remote_uploads_path, local_uploads_path + "/"],
                capture_output=True,
                text=True,
                timeout=600
            )

            if result.returncode == 0:
                log_success("uploads 目录同步完成!")
                return True
            else:
                log_error(f"rsync 同步失败: {result.stderr}")
                return False
        except subprocess.TimeoutExpired:
            log_error("rsync 同步超时")
            return False
        except Exception as e:
            log_error(f"rsync 同步出错: {e}")
            return False
    elif shutil.which("scp"):
        log_step("rsync 不可用，使用 scp...")
        try:
            result = subprocess.run(
                ["scp", "-r", "-o", "StrictHostKeyChecking=no",
                 remote_uploads_path, os.path.dirname(local_uploads_path) + "/"],
                capture_output=True,
                text=True,
                timeout=600
            )

            if result.returncode == 0:
                log_success("uploads 目录同步完成!")
                return True
            else:
                log_error(f"scp 同步失败: {result.stderr}")
                return False
        except subprocess.TimeoutExpired:
            log_error("scp 同步超时")
            return False
        except Exception as e:
            log_error(f"scp 同步出错: {e}")
            return False
    else:
        log_error("rsync 和 scp 工具均未找到，请确保 OpenSSH 已安装")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="BG Hub 数据库同步脚本",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
    # 下载服务器数据库到本地
    python sync_db.py -h your-server.com

    # 指定服务器路径
    python sync_db.py -h your-server.com -p /root/mywebsite/BGHub

    # 跳过确认，直接下载
    python sync_db.py -h your-server.com -y

    # 同时同步数据库和 uploads 目录
    python sync_db.py -h your-server.com --uploads

    # 仅同步 uploads 目录
    python sync_db.py -h your-server.com --uploads-only
        """
    )

    parser.add_argument("--host", dest="server_host", default="",
                        help="服务器地址 (必填)")
    parser.add_argument("-u", "--user", dest="server_user", default="root",
                        help="服务器用户名 (默认: root)")
    parser.add_argument("-p", "--path", dest="server_path", default="/root/mywebsite/BGHub",
                        help="服务器路径 (默认: /root/mywebsite/BGHub)")
    parser.add_argument("-y", "--yes", dest="skip_confirm", action="store_true",
                        help="跳过确认提示")
    parser.add_argument("--no-backup", dest="no_backup", action="store_true",
                        help="跳过本地数据库备份")
    parser.add_argument("--uploads", dest="sync_uploads", action="store_true",
                        help="同步 uploads 目录")
    parser.add_argument("--uploads-only", dest="uploads_only", action="store_true",
                        help="仅同步 uploads 目录（不同步数据库）")

    args = parser.parse_args()

    server_host = args.server_host
    if not server_host:
        log_warning("请输入服务器地址:")
        server_host = input("服务器地址 (例如: your-server.com 或 192.168.1.100): ").strip()

    if not server_host:
        log_error("服务器地址不能为空")
        sys.exit(1)

    server_user = args.server_user
    server_path = args.server_path
    skip_confirm = args.skip_confirm
    no_backup = args.no_backup
    sync_uploads = args.sync_uploads
    uploads_only = args.uploads_only

    project_root = os.path.dirname(os.path.abspath(__file__))
    local_db_path = os.path.join(project_root, "data", "bigz-hub-mvp.db")

    print()
    print("=" * 50)
    print("   BG Hub 数据库同步脚本")
    print("=" * 50)
    print()
    log_step("配置信息:")
    print(f"  服务器: {server_host}")
    print(f"  用户名: {server_user}")
    print(f"  服务器路径: {server_path}")
    print(f"  本地路径: {local_db_path}")
    if sync_uploads or uploads_only:
        print(f"  同步 uploads: 是")
    print()

    if not skip_confirm:
        if uploads_only:
            confirm = input("警告：此操作将从服务器下载 uploads 目录，是否继续? (y/n): ").strip().lower()
        else:
            confirm = input("警告：此操作将替换本地数据库文件，是否继续? (y/n): ").strip().lower()
        if confirm != 'y':
            log_step("操作已取消")
            sys.exit(0)

    if uploads_only:
        if download_uploads(server_host, server_user, server_path, project_root):
            print()
            print("=" * 50)
            log_success("uploads 目录同步完成!")
            print("=" * 50)
        else:
            log_error("uploads 目录同步失败")
            sys.exit(1)
        return

    if not os.path.exists(os.path.dirname(local_db_path)):
        os.makedirs(os.path.dirname(local_db_path), exist_ok=True)

    if not no_backup:
        if not backup_local_db(local_db_path):
            if not skip_confirm:
                retry = input("备份失败，是否继续? (y/n): ").strip().lower()
                if retry != 'y':
                    log_step("操作已取消")
                    sys.exit(1)

    temp_path = download_database(server_host, server_user, server_path, local_db_path)

    if temp_path:
        if replace_local_db(temp_path, local_db_path):
            if sync_uploads:
                download_uploads(server_host, server_user, server_path, project_root)
            print()
            print("=" * 50)
            log_success("数据库同步完成!")
            print("=" * 50)
        else:
            log_error("数据库替换失败")
            if os.path.exists(temp_path):
                os.remove(temp_path)
            sys.exit(1)
    else:
        log_error("数据库下载失败")
        sys.exit(1)


if __name__ == "__main__":
    main()
