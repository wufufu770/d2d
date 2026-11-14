# d2d 全栈镜像(E39 推送纪律: docker 源规格)——graphd(LadybugDB)+网关+面板依赖就绪
# dsh CLI 按供应链纪律钉版注入(install.sh 同版); 运行时数据挂 /data(VOLUME)。
# 构建: docker build -t ghcr.io/wufufu770/d2d:<tag> .
# 运行: docker run -p 8766:8766 -p 8899:8899 -p 18888:18888 -p 8890:8890 -v d2d-data:/data ghcr.io/wufufu770/d2d:<tag>
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip curl unzip zstd bash && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /d2d
COPY . .
RUN pip install --break-system-packages --no-cache-dir -r requirements.txt && \
    npm ci --no-audit --no-fund --omit=dev && \
    cd plugin/pentest-dsh && npm ci --no-audit --no-fund --omit=dev && \
    npm i -g @deepseek-ai/dsh@0.2.2-rc.1
ENV P2P_GRAPHD=http://127.0.0.1:8766 \
    D2D_DATA_DIR=/data \
    P2P_PROXY_PORT=18888
RUN mkdir -p /data
VOLUME /data
EXPOSE 8766 8899 18888 8890
# 主进程=graphd(图黑板); 面板/网关按需进容器经 ops 脚本拉起(CMD 覆盖点)
CMD ["python3", "graphd/app.py"]
