FROM pytorch/pytorch:2.6.0-cuda12.4-cudnn9-devel

ARG LONGCAT_COMMIT=6b3f4b8582a8bc3f20f795735f5383716c4ba794
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/opt/longcat \
    LONGCAT_REPO=/opt/longcat \
    LONGCAT_BASE_WEIGHTS=/runpod-volume/weights/LongCat-Video \
    LONGCAT_AVATAR_WEIGHTS=/runpod-volume/weights/LongCat-Video-Avatar-1.5

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg git libgl1 libglib2.0-0 libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

RUN git clone https://github.com/meituan-longcat/LongCat-Video.git /opt/longcat \
    && git -C /opt/longcat checkout "$LONGCAT_COMMIT" \
    && sed -i -e '/^libsndfile1==/d' -e '/^tritonserverclient==/d' /opt/longcat/requirements_avatar.txt \
    && pip install --no-cache-dir -r /opt/longcat/requirements.txt -r /opt/longcat/requirements_avatar.txt

WORKDIR /opt/trellis
COPY requirements.txt ./requirements-worker.txt
RUN pip install --no-cache-dir -r requirements-worker.txt
COPY . ./

CMD ["python", "-u", "handler.py"]

