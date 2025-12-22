import paddle
print(f"CUDA dostępne: {paddle.device.is_compiled_with_cuda()}")
print(f"Liczba GPU: {paddle.device.cuda.device_count()}")