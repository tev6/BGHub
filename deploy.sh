#!/bin/bash
# BG Hub 代码打包上传脚本
# 功能：扫描修改后的代码文件，打包为ZIP，通过SCP上传至服务器
# 作者：BG Hub Dev Team
# 使用方法：
#   ./deploy.sh -h "your-server.com" -p "/var/www/bghub"
#   或按提示输入

set -e

# 默认值
SERVER_HOST=""
SERVER_USER="root"
SERVER_PATH="/var/www/bghub"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
ARCHIVE_NAME="bghub_code_${TIMESTAMP}.zip"

# 排除的文件和目录
EXCLUDE_PATTERNS=(
    "*.db"
    "*.db-*"
    "data/*"
    "node_modules/*"
    ".git/*"
    ".env"
    "*.log"
    "*.tmp"
    "uploads/*"
    "sessions/*"
    "coverage/*"
    ".nyc_output/*"
    "*.test.js"
    ".DS_Store"
    "Thumbs.db"
    ".vscode/*"
    ".idea/*"
    "deploy.ps1"
    "deploy.sh"
)

# 需要包含的目录
INCLUDE_PATHS=(
    "app.js"
    "package.json"
    "server/"
    "views/"
    "public/"
    "db/migrations/"
    "docs/"
    "components/"
)

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 日志函数
log_step() {
    echo -e "${CYAN}[*] $1${NC}"
}

log_success() {
    echo -e "${GREEN}[+] $1${NC}"
}

log_error() {
    echo -e "${RED}[-] $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}[!] $1${NC}"
}

# 帮助信息
show_help() {
    cat << EOF
BG Hub 代码打包上传脚本 v1.0

用法: ./deploy.sh [选项]

选项:
    -h, --host <host>      服务器地址 (必填)
    -u, --user <user>      服务器用户名 (默认: root)
    -p, --path <path>       服务器路径 (默认: /var/www/bghub)
    -y, --yes              跳过确认提示
    --help                 显示帮助信息

示例:
    ./deploy.sh -h your-server.com -p /var/www/bghub
    ./deploy.sh --host 192.168.1.100 --user admin --yes

EOF
}

# 解析参数
SKIP_CONFIRM=false
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--host)
            SERVER_HOST="$2"
            shift 2
            ;;
        -u|--user)
            SERVER_USER="$2"
            shift 2
            ;;
        -p|--path)
            SERVER_PATH="$2"
            shift 2
            ;;
        -y|--yes)
            SKIP_CONFIRM=true
            shift
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            log_error "未知选项: $1"
            show_help
            exit 1
            ;;
    esac
done

# 检查必要参数
if [ -z "$SERVER_HOST" ]; then
    log_warning "请输入服务器地址:"
    read -p "服务器地址: " SERVER_HOST
fi

if [ -z "$SERVER_HOST" ]; then
    log_error "服务器地址不能为空"
    exit 1
fi

# 显示配置信息
echo ""
echo -e "${MAGENTA}========================================${NC}"
echo -e "${MAGENTA}   BG Hub 代码打包上传脚本 v1.0${NC}"
echo -e "${MAGENTA}========================================${NC}"
echo ""

log_step "配置信息:"
echo "  服务器: $SERVER_HOST"
echo "  用户名: $SERVER_USER"
echo "  路径:   $SERVER_PATH"
echo ""

if [ "$SKIP_CONFIRM" = false ]; then
    read -p "确认开始打包上传? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_step "操作已取消"
        exit 0
    fi
fi

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 检查是否在项目根目录
if [ ! -f "app.js" ] || [ ! -f "package.json" ]; then
    log_error "请在项目根目录运行此脚本"
    exit 1
fi

# 创建临时目录
TEMP_DIR="temp_deploy_${TIMESTAMP}"
mkdir -p "$TEMP_DIR"

# 清理函数
cleanup() {
    log_step "正在清理临时文件..."
    rm -rf "$TEMP_DIR"
    log_success "清理完成"
}

trap cleanup EXIT

# 扫描并复制文件
log_step "正在扫描代码文件..."

FILE_COUNT=0
for include in "${INCLUDE_PATHS[@]}"; do
    if [ -e "$include" ]; then
        if [ -f "$include" ]; then
            # 单个文件
            should_exclude=false
            for pattern in "${EXCLUDE_PATTERNS[@]}"; do
                if [[ "$include" == $pattern ]]; then
                    should_exclude=true
                    break
                fi
            done
            if [ "$should_exclude" = false ]; then
                mkdir -p "$TEMP_DIR"
                cp -r "$include" "$TEMP_DIR/"
                ((FILE_COUNT++))
            fi
        elif [ -d "$include" ]; then
            # 目录
            while IFS= read -r -d '' file; do
                relative="${file#$SCRIPT_DIR/}"
                should_exclude=false
                for pattern in "${EXCLUDE_PATTERNS[@]}"; do
                    if [[ "$relative" == $pattern ]] || [[ "$relative" == $pattern/* ]]; then
                        should_exclude=true
                        break
                    fi
                done
                if [ "$should_exclude" = false ]; then
                    target_dir="$TEMP_DIR/$(dirname "$relative")"
                    mkdir -p "$target_dir"
                    cp -r "$file" "$target_dir/"
                    ((FILE_COUNT++))
                fi
            done < <(find "$include" -type f -print0 2>/dev/null)
        fi
    fi
done

log_success "扫描完成，共发现 ${FILE_COUNT} 个代码文件"

# 创建 ZIP
log_step "正在打包代码文件..."

if [ -f "${ARCHIVE_NAME}" ]; then
    rm -f "${ARCHIVE_NAME}"
fi

zip -r "${ARCHIVE_NAME}" "$TEMP_DIR" -q

# 获取压缩后的大小
ARCHIVE_SIZE=$(du -h "${ARCHIVE_NAME}" | cut -f1)

log_success "打包完成: ${ARCHIVE_NAME} (${ARCHIVE_SIZE})"

# 上传
log_step "正在上传文件到 ${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}..."

# 检查 SCP 是否可用
if ! command -v scp &> /dev/null; then
    log_error "SCP 工具未找到，请确保 OpenSSH 已安装"
    exit 1
fi

log_step "正在传输..."

# 创建远程目录（如果不存在）
ssh "${SERVER_USER}@${SERVER_HOST}" "mkdir -p ${SERVER_PATH}" 2>/dev/null || true

# 上传文件
if scp -q "${ARCHIVE_NAME}" "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/${ARCHIVE_NAME}"; then
    log_success "上传成功!"

    echo ""
    echo -e "${GREEN}========================================${NC}"
    log_success "部署完成!"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    log_step "下一步操作:"
    echo "  1. SSH 登录服务器: ssh ${SERVER_USER}@${SERVER_HOST}"
    echo "  2. 进入目录: cd ${SERVER_PATH}"
    echo "  3. 解压: unzip -o ${ARCHIVE_NAME}"
    echo "  4. 重启服务: pm2 restart bghub 或 systemctl restart bghub"
    echo ""

    if [ "$SKIP_CONFIRM" = false ]; then
        read -p "是否删除本地压缩包? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -f "${ARCHIVE_NAME}"
            log_success "已删除本地压缩包"
        fi
    else
        rm -f "${ARCHIVE_NAME}"
    fi
else
    log_error "上传失败，请检查网络连接和 SCP 配置"
    exit 1
fi
