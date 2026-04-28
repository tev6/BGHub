#!/usr/bin/env python3
"""
BG Hub 代码打包上传脚本 v2.0
功能：
  - 小更新模式：扫描修改后的代码文件，打包为ZIP，通过SCP上传至服务器（保留现有数据）
  - 完全重置模式：打包项目所有文件（包括数据库、uploads等），用于大版本更新
作者：BG Hub Dev Team
使用方法：
    python deploy.py --host your-server.com --path /root/mywebsite/BGHub
    python deploy.py --host your-server.com --path /root/mywebsite/BGHub --mode full
    或按提示输入
"""

import os
import sys
import zipfile
import argparse
import subprocess
import shutil
import fnmatch
from datetime import datetime
from pathlib import Path

# 小更新模式：排除的文件和目录模式
SMALL_EXCLUDE_PATTERNS = [
    "*.db-*",
    "node_modules/",
    ".git/",
    ".env",
    "*.log",
    "*.tmp",
    "uploads/",
    "sessions/",
    "coverage/",
    ".nyc_output/",
    "*.test.js",
    ".DS_Store",
    "Thumbs.db",
    ".vscode/",
    ".idea/",
    "deploy.ps1",
    "deploy.sh",
    "deploy.py",
    "__pycache__/",
    "*.pyc",
    "bghub_code_*.zip",
    ".trae/",
    "stories/",
    "tests/",
    "*.stories.ts",
    "*.md",
]

# 完全重置模式：仅排除 node_modules
FULL_EXCLUDE_PATTERNS = [
    "node_modules/",
]

# 小更新模式需要包含的目录和文件
SMALL_INCLUDE_PATHS = [
    "app.js",
    "package.json",
    "server/",
    "views/",
    "public/",
    "db/",
    "docs/",
    "components/",
    "ctr.service",
    "migrate.js",
    "data/",
]

# 完全重置模式需要包含的目录和文件
FULL_INCLUDE_PATHS = [
    "app.js",
    "package.json",
    "server/",
    "views/",
    "public/",
    "db/",
    "docs/",
    "components/",
    "ctr.service",
    "migrate.js",
    "data/",
    "uploads/",
]


def log_step(message):
    print(f"[*] {message}")


def log_success(message):
    print(f"[+] {message}")


def log_error(message):
    print(f"[-] {message}")


def log_warning(message):
    print(f"[!] {message}")


def should_exclude(file_path, exclude_patterns):
    """检查文件是否应该被排除"""
    path_str = str(file_path).replace("\\", "/")
    for pattern in exclude_patterns:
        if pattern.endswith("/"):
            dir_name = pattern.rstrip("/")
            if path_str.startswith(dir_name + "/"):
                return True
        else:
            if "*" in pattern:
                if fnmatch.fnmatch(os.path.basename(path_str), pattern):
                    return True
            elif path_str.endswith(pattern):
                return True
    return False


def get_code_files(project_root, include_paths, exclude_patterns):
    """扫描项目代码文件"""
    log_step("正在扫描代码文件...")
    files = []

    for include in include_paths:
        full_path = os.path.join(project_root, include)
        if os.path.exists(full_path):
            if os.path.isfile(full_path):
                if not should_exclude(include, exclude_patterns):
                    files.append(full_path)
            elif os.path.isdir(full_path):
                for root, dirs, filenames in os.walk(full_path):
                    dirs[:] = [d for d in dirs if not should_exclude(os.path.join(root, d), exclude_patterns)]

                    for filename in filenames:
                        file_path = os.path.join(root, filename)
                        relative_path = os.path.relpath(file_path, project_root)
                        if not should_exclude(relative_path, exclude_patterns):
                            files.append(file_path)

    log_success(f"扫描完成，共发现 {len(files)} 个文件")
    return files


def create_archive(project_root, files, mode="small"):
    """打包代码文件为ZIP"""
    log_step("正在打包代码文件...")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    mode_prefix = "bghub_full" if mode == "full" else "bghub_code"
    archive_name = f"{mode_prefix}_{timestamp}.zip"
    archive_path = os.path.join(project_root, archive_name)

    temp_dir = os.path.join(project_root, f"temp_deploy_{timestamp}")

    try:
        os.makedirs(temp_dir, exist_ok=True)

        for file_path in files:
            relative_path = os.path.relpath(file_path, project_root)
            dest_path = os.path.join(temp_dir, relative_path)
            dest_dir = os.path.dirname(dest_path)

            os.makedirs(dest_dir, exist_ok=True)
            shutil.copy2(file_path, dest_path)

        log_success(f"已复制 {len(files)} 个文件到临时目录")

        if os.path.exists(archive_path):
            os.remove(archive_path)

        with zipfile.ZipFile(archive_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for root, dirs, filenames in os.walk(temp_dir):
                for filename in filenames:
                    file_path = os.path.join(root, filename)
                    arcname = os.path.relpath(file_path, temp_dir)
                    zipf.write(file_path, arcname)

        archive_size = os.path.getsize(archive_path)
        size_mb = round(archive_size / (1024 * 1024), 2)

        log_success(f"打包完成: {archive_name} ({size_mb} MB)")

        return archive_path
    finally:
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
            log_step("已清理临时目录")


def upload_via_scp(archive_path, host, user, remote_path):
    """通过SCP上传文件"""
    log_step(f"正在上传文件到 {user}@{host}:{remote_path}...")

    if not shutil.which("scp"):
        log_error("SCP 工具未找到，请确保 OpenSSH 已安装")
        return False, None

    filename = os.path.basename(archive_path)
    remote_uri = f"{user}@{host}:{remote_path}/{filename}"

    log_step("正在传输...")

    try:
        result = subprocess.run(
            ["scp", "-o", "StrictHostKeyChecking=no", archive_path, remote_uri],
            capture_output=True,
            text=True,
            timeout=600
        )

        if result.returncode == 0:
            log_success("上传成功!")
            return True, filename
        else:
            log_error(f"上传失败: {result.stderr}")
            return False, None
    except subprocess.TimeoutExpired:
        log_error("上传超时，请检查网络连接")
        return False, None
    except Exception as e:
        log_error(f"上传出错: {e}")
        return False, None


def generate_server_script(mode, filename, remote_path):
    """生成服务器端执行的脚本"""
    script_lines = []

    if mode == "small":
        script_lines = [
            "#!/bin/bash",
            "# 小更新部署脚本 - 保留现有数据",
            "",
            f"cd {remote_path}",
            f"unzip -o {filename}",
            "pm2 restart bghub || systemctl restart bghub",
            f"rm {filename}",
            "echo '小更新部署完成!'",
        ]
    else:
        script_lines = [
            "#!/bin/bash",
            "# 完全重置部署脚本 - 替换所有文件",
            "",
            f"cd {remote_path}",
            f"rm -rf app.js server/ views/ public/ db/ docs/ components/",
            f"unzip -o {filename}",
            "pm2 restart bghub || systemctl restart bghub",
            f"rm {filename}",
            "echo '完全重置部署完成!'",
        ]

    return "\n".join(script_lines)


def upload_and_execute_script(remote_path, script_content, host, user):
    """上传并执行服务器脚本"""
    log_step("正在生成部署脚本...")

    script_name = "deploy_server.sh"
    local_script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), script_name)

    with open(local_script_path, "w", encoding="utf-8") as f:
        f.write(script_content)

    log_step(f"正在上传部署脚本到服务器...")

    try:
        result = subprocess.run(
            ["scp", "-o", "StrictHostKeyChecking=no", local_script_path, f"{user}@{host}:{remote_path}/{script_name}"],
            capture_output=True,
            text=True,
            timeout=60
        )

        if result.returncode != 0:
            log_error(f"脚本上传失败: {result.stderr}")
            log_step(f"请手动执行以下命令:\n  ssh {user}@{host}")
            log_step(f"  cd {remote_path}")
            log_step(f"  cat > {script_name} << 'EOF'\n{script_content}\nEOF")
            log_step(f"  chmod +x {script_name} && ./{script_name}")
            return False
    except Exception as e:
        log_error(f"脚本上传出错: {e}")
        return False
    finally:
        if os.path.exists(local_script_path):
            os.remove(local_script_path)

    log_step("正在服务器执行部署脚本...")

    try:
        ssh_cmd = f"ssh -o StrictHostKeyChecking=no {user}@{host}"
        result = subprocess.run(
            f"{ssh_cmd} 'cd {remote_path} && chmod +x {script_name} && ./{script_name}'",
            shell=True,
            capture_output=True,
            text=True,
            timeout=300
        )

        if result.returncode == 0:
            log_success("服务器部署执行成功!")
            if result.stdout:
                print(result.stdout)
            return True
        else:
            log_error(f"服务器部署执行失败: {result.stderr}")
            return False
    except subprocess.TimeoutExpired:
        log_error("服务器部署超时")
        return False
    except Exception as e:
        log_error(f"服务器部署出错: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="BG Hub 代码打包上传脚本 v2.0",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
    # 小更新（保留现有数据）
    python deploy.py -h your-server.com -p /root/mywebsite/BGHub

    # 完全重置（替换所有文件，包括数据库）
    python deploy.py -h your-server.com -p /root/mywebsite/BGHub --mode full

    # 跳过确认，直接部署
    python deploy.py -h your-server.com -p /root/mywebsite/BGHub --yes
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
    parser.add_argument("--mode", dest="deploy_mode", default="small",
                        choices=["small", "full"],
                        help="部署模式: small=小更新(保留数据), full=完全重置(替换所有) (默认: small)")

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
    deploy_mode = args.deploy_mode

    mode_desc = "小更新模式（保留现有数据）" if deploy_mode == "small" else "完全重置模式（替换所有文件）"

    print()
    print("=" * 50)
    print("   BG Hub 代码打包上传脚本 v2.0")
    print("=" * 50)
    print()
    log_step("配置信息:")
    print(f"  服务器: {server_host}")
    print(f"  用户名: {server_user}")
    print(f"  路径:   {server_path}")
    print(f"  模式:   {mode_desc}")
    print()

    if not skip_confirm:
        confirm = input("确认开始打包上传? (y/n): ").strip().lower()
        if confirm != 'y':
            log_step("操作已取消")
            sys.exit(0)

    print()

    project_root = os.path.dirname(os.path.abspath(__file__))

    if not os.path.exists(os.path.join(project_root, "app.js")):
        log_error("请在项目根目录运行此脚本")
        sys.exit(1)

    try:
        if deploy_mode == "small":
            include_paths = SMALL_INCLUDE_PATHS
            exclude_patterns = SMALL_EXCLUDE_PATTERNS
        else:
            include_paths = FULL_INCLUDE_PATHS
            exclude_patterns = FULL_EXCLUDE_PATTERNS

        files = get_code_files(project_root, include_paths, exclude_patterns)
        archive_path = create_archive(project_root, files, deploy_mode)

        print()

        upload_success, filename = upload_via_scp(archive_path, server_host, server_user, server_path)

        if upload_success:
            print()
            script_content = generate_server_script(deploy_mode, filename, server_path)

            if not skip_confirm:
                auto_exec = input("是否自动在服务器执行部署脚本? (y/n): ").strip().lower()
            else:
                auto_exec = 'y'

            if auto_exec == 'y':
                exec_success = upload_and_execute_script(server_path, script_content, server_host, server_user)
                if not exec_success:
                    log_warning("自动执行失败，请手动在服务器执行部署")
            else:
                log_step("请手动在服务器执行以下命令:")
                print(f"  ssh {server_user}@{server_host}")
                print(f"  cd {server_path}")
                print(f"  unzip -o {filename}")
                if deploy_mode == "small":
                    print("  pm2 restart bghub || systemctl restart bghub")
                else:
                    print("  pm2 restart bghub || systemctl restart bghub")
                print(f"  rm {filename}")

            print()
            print("=" * 50)
            log_success("部署完成!")
            print("=" * 50)

            if not skip_confirm:
                cleanup = input("是否删除本地压缩包? (y/n): ").strip().lower()
                if cleanup == 'y':
                    os.remove(archive_path)
                    log_success("已删除本地压缩包")
            else:
                os.remove(archive_path)
        else:
            log_error("上传失败，请检查网络连接和 SCP 配置")
            sys.exit(1)

    except KeyboardInterrupt:
        log_warning("\n操作已取消")
        sys.exit(0)
    except Exception as e:
        log_error(f"发生错误: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
