# LongCat RunPod Serverless worker

This image implements the `trellis.media-generation.v1` contract. It downloads private inputs through signed URLs, runs the pinned upstream LongCat code, uploads one MP4 through a one-time signed upload URL, and returns only output metadata to RunPod.

The image deliberately does not bake the 75–83 GB model repositories into Docker. Mount a RunPod network volume at `/runpod-volume` with:

- `weights/LongCat-Video`
- `weights/LongCat-Video-Avatar-1.5`

Build the image from this directory. Use separate RunPod endpoints for the base and Avatar workloads even though the image can route both. Configure the base endpoint with one or more GPUs through `LONGCAT_BASE_GPU_COUNT`; configure Avatar 1.5 with two visible GPUs because the adapter enforces context parallelism 2, distillation, INT8, and eight steps.

This worker must be GPU-benchmarked before production. The first benchmark should verify the exact RunPod GPU SKU, cold model-load time, network-volume throughput, peak VRAM, cancellation behavior, 480p/720p output, and the signed upload request against the deployed Supabase project.
