import argparse
import concurrent.futures
import statistics
import time
import urllib.error
import urllib.request
from pathlib import Path


def _rss_kib(pid: int) -> int | None:
    try:
        status = Path(f"/proc/{pid}/status").read_text(encoding="utf-8")
    except OSError:
        return None
    for line in status.splitlines():
        if line.startswith("VmRSS:"):
            parts = line.split()
            if len(parts) >= 2:
                return int(parts[1])
    return None


def _request(url: str, token: str | None) -> tuple[int, float]:
    request = urllib.request.Request(url, method="GET")
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            response.read()
            status = response.status
    except urllib.error.HTTPError as exc:
        exc.read()
        status = exc.code
    except OSError:
        status = 0
    return status, (time.perf_counter() - started) * 1000


def main() -> int:
    parser = argparse.ArgumentParser(description="Uji beban ringan dan pantau RAM proses.")
    parser.add_argument("--url", default="http://127.0.0.1:8000/health")
    parser.add_argument("--requests", type=int, default=200)
    parser.add_argument("--concurrency", type=int, default=20)
    parser.add_argument("--token", default="", help="Virtual/admin token bila endpoint privat.")
    parser.add_argument("--pid", type=int, default=0, help="PID backend untuk membaca VmRSS.")
    args = parser.parse_args()

    if args.requests < 1 or args.concurrency < 1:
        print("--requests dan --concurrency harus lebih dari 0.")
        return 1

    before = _rss_kib(args.pid) if args.pid else None
    started = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        futures = [
            executor.submit(_request, args.url, args.token or None)
            for _ in range(args.requests)
        ]
        results = [future.result() for future in futures]
    elapsed = time.perf_counter() - started
    after = _rss_kib(args.pid) if args.pid else None

    statuses: dict[int, int] = {}
    for status, _ in results:
        statuses[status] = statuses.get(status, 0) + 1
    latencies = [latency for _, latency in results]
    failures = sum(count for status, count in statuses.items() if status != 200)

    print(f"Request     : {args.requests}")
    print(f"Concurrency : {args.concurrency}")
    print(f"Durasi      : {elapsed:.2f} s")
    print(f"Throughput  : {args.requests / elapsed:.1f} req/s")
    print(f"Latensi p50 : {statistics.median(latencies):.1f} ms")
    if len(latencies) >= 20:
        p95 = statistics.quantiles(latencies, n=20)[18]
        print(f"Latensi p95 : {p95:.1f} ms")
    print(f"Gagal       : {failures}")
    print(f"Status      : {dict(sorted(statuses.items()))}")
    if before is not None and after is not None:
        print(f"RAM sebelum : {before / 1024:.1f} MiB")
        print(f"RAM sesudah : {after / 1024:.1f} MiB")
        print(f"Delta RAM   : {(after - before) / 1024:+.1f} MiB")

    return 0 if failures == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
