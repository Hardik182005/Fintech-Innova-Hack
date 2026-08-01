# OPA sidecar for the API service (ADR-004). The policy bundle is baked into
# the image so the sidecar has no runtime dependency on any bucket or network
# fetch — the policies that authorize money are pinned by image digest.
FROM openpolicyagent/opa:1.4.2

COPY credence/policy/rego /policies

# Cloud Run sidecars share localhost with the API container.
ENTRYPOINT ["/opa"]
CMD ["run", "--server", "--addr", "0.0.0.0:8181", "/policies"]
