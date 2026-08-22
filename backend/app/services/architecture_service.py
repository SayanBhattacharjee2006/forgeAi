from pathlib import Path
from typing import Any, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.services.constitution_service import ConstitutionService


def _slugify(text: str) -> str:
    """Helper to convert a text label to a safe node ID component."""
    return "".join(c if c.isalnum() else "_" for c in text.lower()).strip("_")


def _infer_domain_profile(name: str, description: str, repo_name: str, decisions: list[dict]) -> dict[str, Any]:
    """Infers the software domain, business services, and integrations from project context."""
    text_corpus = f"{name} {description} {repo_name} {' '.join(d.get('decision_text', '') for d in decisions)}".lower()

    if any(k in text_corpus for k in ["relief", "disaster", "volunteer", "rescue", "emergency", "crisis", "sahaay", "aid"]):
        return {
            "domain": "Disaster Relief & Emergency Operations",
            "style": "Event-Driven Microservices Architecture",
            "frontend_clients": [
                (f"{name} Citizen Portal", "frontend", "Web interface for crisis reporting, aid requests, and community assistance.", "Layers", ["Next.js", "TailwindCSS", "Leaflet"]),
                (f"{name} Field Volunteer Mobile App", "frontend", "Mobile client for on-ground rescue volunteers and dispatch units.", "Folder", ["React Native", "Expo", "GPS / Offline Sync"]),
            ],
            "gateway": (f"{name} Emergency Operations Gateway", "REST & WebSocket Gateway handling incident ingestion and live volunteer telemetry.", ["FastAPI", "WebSockets", "Python"]),
            "services": [
                ("Volunteer Dispatch & Triage Service", "services", "Coordinates real-time volunteer routing and high-priority rescue triage.", "Activity", ["Python", "FastAPI"]),
                ("Emergency Resource Allocation Engine", "services", "Matches food, medical supplies, and shelter inventory to affected zones.", "Cpu", ["Python", "Redis Queue"]),
                ("Geospatial Incident Mapping Service", "services", "Computes disaster radius, live hazard zones, and evacuation routes.", "Sparkles", ["PostGIS", "Python", "GeoJSON"]),
            ],
            "databases": ["PostgreSQL / PostGIS", "Redis Alert Queue"],
            "external_services": ["Mapbox Geospatial API", "Twilio SMS Emergency Broadcast"],
            "infrastructure": ["Docker Containers", "AWS Cloud / Kubernetes"],
        }

    elif any(k in text_corpus for k in ["crypto", "blockchain", "trade", "trading", "wallet", "fintech", "exchange", "ledger", "bank"]):
        return {
            "domain": "Fintech & High-Frequency Trading",
            "style": "Event-Sourced Low-Latency Architecture",
            "frontend_clients": [
                (f"{name} Trading Terminal", "frontend", "High-frequency responsive trading dashboard with real-time candlestick charts.", "Layers", ["React", "TailwindCSS", "TradingView Lightweight"]),
                (f"{name} Mobile Crypto Wallet", "frontend", "Non-custodial mobile wallet interface with biometric signing.", "Folder", ["React Native", "Web3.js"]),
            ],
            "gateway": (f"{name} FIX & WebSocket Trading Gateway", "Ultra-low-latency order routing and market stream gateway.", ["Go / Gin", "WebSockets", "gRPC"]),
            "services": [
                ("Order Matching & Execution Engine", "services", "In-memory order book matcher executing limit and market orders in microseconds.", "Cpu", ["Go", "C++", "ZeroMQ"]),
                ("Wallet Custody & Transaction Signer", "auth", "Cold/Hot wallet key management and multi-sig cryptographic transaction verification.", "Sparkles", ["Rust", "ECDSA"]),
                ("Risk & Margin Calculation Worker", "services", "Continuous real-time liquidation monitoring and collateral risk validation.", "Activity", ["Python", "NumPy"]),
            ],
            "databases": ["TimescaleDB / Postgres", "Redis In-Memory OrderBook"],
            "external_services": ["Ethereum / Solana RPC Nodes", "CoinGecko Market Feeds"],
            "infrastructure": ["Kubernetes", "AWS Fargate", "Cloudflare DDoS Shield"],
        }

    elif any(k in text_corpus for k in ["health", "medical", "patient", "doctor", "clinic", "hospital", "telehealth", "ehr", "telemedicine"]):
        return {
            "domain": "Healthcare & Telemedicine",
            "style": "HIPAA-Compliant Microservices Architecture",
            "frontend_clients": [
                (f"{name} Patient Telehealth Portal", "frontend", "Patient booking, video consultation, and prescription viewer.", "Layers", ["Next.js", "React", "WebRTC"]),
                (f"{name} Physician Clinical Station", "frontend", "Doctor dashboard for medical chart notes and diagnostic telemetry.", "Folder", ["React", "TailwindCSS"]),
            ],
            "gateway": (f"{name} HIPAA-Compliant API Gateway", "Secured ingress enforcing mTLS, audit trails, and role-based clinician access.", ["Node.js", "Express", "OAuth2"]),
            "services": [
                ("Electronic Health Records (EHR) Service", "services", "Encrypted clinical history, lab diagnostics, and patient vitals management.", "Cpu", ["Java / Spring Boot", "FHIR Standard"]),
                ("Live Video Consultation Gateway", "services", "Encrypted peer-to-peer WebRTC video stream orchestration and audio recording.", "Activity", ["WebRTC", "Agora SDK"]),
                ("Prescription & Pharmacy Dispatcher", "services", "Coordinates digital prescription signing and direct pharmacy fulfillment.", "Sparkles", ["Python", "FastAPI"]),
            ],
            "databases": ["Encrypted PostgreSQL", "Redis Session Cache"],
            "external_services": ["Agora WebRTC Video", "Stripe Healthcare Billing"],
            "infrastructure": ["HIPAA AWS GovCloud", "Docker Containers"],
        }

    elif any(k in text_corpus for k in ["shop", "store", "commerce", "cart", "product", "checkout", "ecommerce", "retail"]):
        return {
            "domain": "E-Commerce & Digital Commerce",
            "style": "Modular Event-Driven Architecture",
            "frontend_clients": [
                (f"{name} Storefront Web App", "frontend", "Responsive storefront catalog, shopping bag, and instant checkout flow.", "Layers", ["Next.js", "React", "TailwindCSS"]),
                (f"{name} Merchant Admin Hub", "frontend", "Inventory manager, sales analytics, and fulfillment management console.", "Folder", ["React", "Shadcn/UI"]),
            ],
            "gateway": (f"{name} GraphQL & REST Gateway", "Unified API layer serving catalog queries and mutating cart transactions.", ["Apollo GraphQL", "Express.js"]),
            "services": [
                ("Product Catalog & Search Service", "services", "Faceted product filtering, category taxonomies, and instant elastic search.", "Cpu", ["Node.js", "Elasticsearch"]),
                ("Checkout & Payment Gateway Service", "services", "Atomic transaction processing, tax calculations, and payment provider routing.", "Sparkles", ["Go / Python", "Stripe SDK"]),
                ("Inventory & Fulfillment Engine", "services", "Tracks stock reservations, warehouse shipments, and carrier tracking webhooks.", "Activity", ["Node.js", "RabbitMQ"]),
            ],
            "databases": ["PostgreSQL", "Redis Product Cache"],
            "external_services": ["Stripe Payment API", "SendGrid Email Dispatch", "Shippo Shipping API"],
            "infrastructure": ["Vercel Edge Network", "AWS ECS", "GitHub Actions"],
        }

    elif any(k in text_corpus for k in ["ai", "forge", "intelligence", "assistant", "agent", "llm", "rag", "vector", "voice", "audio"]):
        return {
            "domain": "AI Project Intelligence & Developer Governance",
            "style": "Autonomous Multi-Agent Architecture",
            "frontend_clients": [
                (f"{name} Collaborative Workspace UI", "frontend", "Unified dashboard for team chat, decision visualization, and architecture governance.", "Layers", ["Next.js", "ReactFlow", "TailwindCSS"]),
                (f"{name} Voice Room & Sync Station", "frontend", "Real-time meeting audio capture and automated meeting transcription recorder.", "Folder", ["WebRTC", "MediaRecorder API"]),
            ],
            "gateway": (f"{name} AI Gateway & Assistant Ingress", "Coordinates @Forge agent invocations, WebSocket streams, and REST API routing.", ["FastAPI", "Pydantic", "Python"]),
            "services": [
                ("Decision Intelligence & Conflict Engine", "services", "Pairwise semantic conflict analysis, contract verification, and decision logs.", "Cpu", ["Python", "OpenAI / Gemini"]),
                ("Project Constitution Governance Service", "auth", "Authoritative tech stack standardization, versioning, and drift enforcement.", "Sparkles", ["Python", "Motor"]),
                ("Hybrid RAG & Context Retriever", "services", "Dense vector embeddings combined with sparse BM25 search over codebase AST.", "Activity", ["Qdrant", "SentenceTransformers"]),
            ],
            "databases": ["MongoDB Atlas", "Qdrant Vector Database", "Redis RQ Worker Queue"],
            "external_services": ["OpenAI GPT-4o / Gemini", "GitHub REST API", "Discord Gateway Bot"],
            "infrastructure": ["Docker Compose", "Prometheus Telemetry", "GitHub Actions"],
        }

    else:
        # Default tailored to project name
        return {
            "domain": f"{name} Domain Architecture",
            "style": "Layered Microservices Architecture",
            "frontend_clients": [
                (f"{name} Web Application", "frontend", f"Primary responsive user interface and presentation layer for {name}.", "Layers", ["React", "Next.js", "TailwindCSS"]),
            ],
            "gateway": (f"{name} REST API Gateway", f"Central ingress controller handling authentication, route dispatching, and API contracts for {name}.", ["FastAPI / Express", "REST"]),
            "services": [
                (f"{name} Core Business Logic Engine", "services", f"Encapsulates domain entities, business workflows, and transactions for {name}.", "Cpu", ["Python / TypeScript"]),
                (f"{name} Identity & Security Service", "auth", f"Manages user authentication, session tokens, and access policies for {name}.", "Sparkles", ["OAuth2 / JWT"]),
                (f"{name} Async Workflow & Event Worker", "services", f"Coordinates background asynchronous tasks and event dispatching for {name}.", "Activity", ["Redis Queue / Celery"]),
            ],
            "databases": ["PostgreSQL / MongoDB", "Redis Cache"],
            "external_services": ["Cloud Storage / S3", "Notification Dispatcher"],
            "infrastructure": ["Docker Containers", "CI/CD Pipeline"],
        }


async def build_project_architecture_graph(
    project_id: str, db: AsyncIOMotorDatabase
) -> dict[str, Any]:
    """Dynamically generates the complete 4-Tier software architecture topology for a specific project.
    
    Synthesizes:
    - Project Constitution (Technology stack, frameworks, databases, service boundaries, layering rules)
    - Ingested repository modules & code structure (from github_chunks/code_chunks)
    - Active project decisions and architectural contracts
    - Inferred domain profile from project identity & repository context
    """
    # 1. Fetch Project & Constitution details
    project_doc = await db["projects"].find_one({"$or": [{"project_id": project_id}, {"_id": project_id}]})
    proj_name = project_doc.get("name", "Project") if project_doc else "Project"
    repo_name = project_doc.get("github_repo_name", "") if project_doc else ""
    proj_desc = project_doc.get("description", "") if project_doc else ""

    constitution = await ConstitutionService.get_or_create_constitution(db, project_id, "system")
    tech = constitution.sections.technology
    arch = constitution.sections.architecture
    api_conv = constitution.sections.api_conventions
    ui_conv = constitution.sections.design_ui_conventions

    # Fetch active decisions for this project
    cursor_decisions = db["decisions"].find({"project_id": project_id})
    decisions = await cursor_decisions.to_list(length=50)

    # Infer domain intelligence profile
    domain_profile = _infer_domain_profile(proj_name, proj_desc, repo_name, decisions)

    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    subsystem_set: set[str] = set()

    # Determine languages & styles (Constitution overrides profile when specified)
    langs = tech.languages or ["TypeScript", "Python"]
    arch_style = arch.style or domain_profile["style"]
    api_style = api_conv.style or "REST API"

    # ══════════════════════════════════════════════════════════════════════════
    # TIER 1: FRONTEND CLIENTS & UI APPLICATIONS (Layer: 'frontend', Tier: 1)
    # ══════════════════════════════════════════════════════════════════════════
    frontend_frameworks = [f for f in tech.frameworks if any(k in f.lower() for k in ["react", "next", "vue", "angular", "svelte", "tailwind", "vite", "flutter", "native", "html", "css", "solid"])]
    
    tier1_client_ids: list[str] = []

    if tech.frameworks or ui_conv.styling_conventions:
        # User defined frontend in Constitution
        ui_tech = list(dict.fromkeys((frontend_frameworks or ["React", "TailwindCSS"]) + (ui_conv.styling_conventions or []) + (ui_conv.state_management or [])))
        web_node_id = f"client:web_{_slugify(proj_name)}"
        nodes.append({
            "id": web_node_id,
            "label": f"{proj_name} Web Application",
            "layer": "frontend",
            "subsystem": "frontend",
            "tier": 1,
            "detail": f"/{_slugify(proj_name)}-client",
            "role": f"Primary responsive user interface and presentation layer for {proj_name}.",
            "icon": "Layers",
            "technologies": ui_tech[:4],
        })
        tier1_client_ids.append(web_node_id)
        subsystem_set.add("frontend")
    else:
        # Use inferred domain clients
        for c_label, c_sub, c_role, c_icon, c_tech in domain_profile["frontend_clients"]:
            c_id = f"client:{_slugify(c_label)}"
            nodes.append({
                "id": c_id,
                "label": c_label,
                "layer": "frontend",
                "subsystem": c_sub,
                "tier": 1,
                "detail": f"Client Application: {c_label}",
                "role": c_role,
                "icon": c_icon,
                "technologies": c_tech,
            })
            tier1_client_ids.append(c_id)
            subsystem_set.add("frontend")

    # ══════════════════════════════════════════════════════════════════════════
    # TIER 2: API GATEWAY & ROUTE CONTROLLERS (Layer: 'backend_api', Tier: 2)
    # ══════════════════════════════════════════════════════════════════════════
    backend_frameworks = [f for f in tech.frameworks if f not in frontend_frameworks]
    gateway_node_id = f"api:gateway_{_slugify(proj_name)}"

    if backend_frameworks:
        gw_label = f"{proj_name} {api_style} Gateway"
        gw_role = f"Central ingress controller handling authentication, route dispatching, request validation, and API contracts."
        gw_tech = list(dict.fromkeys(backend_frameworks + [api_style] + langs))[:4]
    else:
        gw_label, gw_role, gw_tech = domain_profile["gateway"]

    nodes.append({
        "id": gateway_node_id,
        "label": gw_label,
        "layer": "backend_api",
        "subsystem": "api",
        "tier": 2,
        "detail": f"/api/v1 ({api_style})",
        "role": gw_role,
        "icon": "Bot",
        "technologies": gw_tech,
    })
    subsystem_set.add("api")

    # Connect Tier 1 -> Tier 2
    for c_id in tier1_client_ids:
        edges.append({
            "id": f"{c_id}->{gateway_node_id}",
            "source": c_id,
            "target": gateway_node_id,
            "relation": f"{api_style} Ingress",
        })

    # ══════════════════════════════════════════════════════════════════════════
    # TIER 3: CORE DOMAIN & BUSINESS SERVICES (Layer: 'backend_service', Tier: 3)
    # ══════════════════════════════════════════════════════════════════════════
    service_nodes: list[str] = []

    # If Service Boundaries are explicitly defined in Project Constitution
    if arch.service_boundaries:
        for idx, boundary in enumerate(arch.service_boundaries):
            b_slug = _slugify(boundary)
            s_id = f"svc:{b_slug}_{idx}"
            s_sub = "services"
            if "auth" in b_slug or "security" in b_slug:
                s_sub = "auth"
            elif "data" in b_slug or "ingest" in b_slug:
                s_sub = "ingestion"
            elif "billing" in b_slug or "payment" in b_slug:
                s_sub = "billing"

            nodes.append({
                "id": s_id,
                "label": boundary,
                "layer": "backend_service",
                "subsystem": s_sub,
                "tier": 3,
                "detail": f"Service Boundary: {boundary}",
                "role": f"Dedicated domain service responsible for {boundary} business rules and state transactions ({arch_style}).",
                "icon": "Cpu",
                "technologies": (backend_frameworks or ["Service Layer"])[:2] + langs[:1],
            })
            service_nodes.append(s_id)
            subsystem_set.add(s_sub)
    else:
        # Use inferred domain business services
        for s_label, s_sub, s_role, s_icon, s_tech in domain_profile["services"]:
            s_id = f"svc:{_slugify(s_label)}"
            nodes.append({
                "id": s_id,
                "label": s_label,
                "layer": "backend_service",
                "subsystem": s_sub,
                "tier": 3,
                "detail": f"Domain Layer: {arch_style}",
                "role": s_role,
                "icon": s_icon,
                "technologies": s_tech,
            })
            service_nodes.append(s_id)
            subsystem_set.add(s_sub)

    # Connect Tier 2 -> Tier 3
    for s_id in service_nodes:
        edges.append({
            "id": f"{gateway_node_id}->{s_id}",
            "source": gateway_node_id,
            "target": s_id,
            "relation": "Dispatches Logic / RPC",
        })

    # ══════════════════════════════════════════════════════════════════════════
    # TIER 4: DATA STORES, CACHING & INFRASTRUCTURE (Layer: 'external', Tier: 4)
    # ══════════════════════════════════════════════════════════════════════════
    tier4_nodes: list[str] = []

    # 1. Databases
    databases = tech.databases or domain_profile["databases"]
    for idx, db_name in enumerate(databases):
        db_id = f"db:{_slugify(db_name)}_{idx}"
        is_cache = any(k in db_name.lower() for k in ["redis", "memcached", "valkey", "dragonfly", "queue"])
        nodes.append({
            "id": db_id,
            "label": f"{db_name} Storage",
            "layer": "external",
            "subsystem": "cache" if is_cache else "database",
            "tier": 4,
            "detail": f"{db_name} Operational Persistence",
            "role": f"Provides {'high-throughput in-memory caching, message queues, and pub/sub' if is_cache else 'primary persistent operational storage and transactional integrity'} for {proj_name}.",
            "icon": "Server" if is_cache else "Database",
            "technologies": [db_name, "Persistence / ORM"],
        })
        tier4_nodes.append(db_id)
        subsystem_set.add("cache" if is_cache else "database")

    # 2. External Cloud Services & APIs
    ext_services = tech.external_services or domain_profile["external_services"]
    for idx, ext_name in enumerate(ext_services):
        ext_id = f"ext:{_slugify(ext_name)}_{idx}"
        nodes.append({
            "id": ext_id,
            "label": f"{ext_name} Service",
            "layer": "external",
            "subsystem": "external",
            "tier": 4,
            "detail": f"External API: {ext_name}",
            "role": f"Third-party cloud integration providing external {ext_name} capabilities and webhook endpoints.",
            "icon": "Network",
            "technologies": [ext_name, "Cloud API / SDK"],
        })
        tier4_nodes.append(ext_id)
        subsystem_set.add("external")

    # 3. Infrastructure / CI/CD
    infra_labels = tech.infrastructure or domain_profile["infrastructure"]
    if infra_labels:
        infra_id = f"infra:{_slugify(proj_name)}"
        nodes.append({
            "id": infra_id,
            "label": f"Deployment & Cloud ({', '.join(infra_labels[:2])})",
            "layer": "external",
            "subsystem": "infra",
            "tier": 4,
            "detail": f"Cloud Hosting: {', '.join(infra_labels)}",
            "role": f"Automated CI/CD pipelines, container orchestration, and cloud infrastructure for {proj_name}.",
            "icon": "GitBranch",
            "technologies": infra_labels[:4],
        })
        tier4_nodes.append(infra_id)
        subsystem_set.add("infra")

    # Connect Tier 3 -> Tier 4
    for s_id in service_nodes:
        for t4_id in tier4_nodes:
            relation = "Queries / Persists"
            if t4_id.startswith("ext:"):
                relation = "External API Integration"
            elif "cache" in t4_id:
                relation = "Caches / Message PubSub"
            elif "infra" in t4_id:
                relation = "Deploys & Telemetry"

            edges.append({
                "id": f"{s_id}->{t4_id}",
                "source": s_id,
                "target": t4_id,
                "relation": relation,
            })

    # Subsystem Metadata for UI filtering
    SUBSYSTEM_META = {
        "frontend": {"label": "Frontend & UI", "icon": "Layers"},
        "api": {"label": "API Gateway & Routing", "icon": "Bot"},
        "services": {"label": "Domain & Business Services", "icon": "Cpu"},
        "auth": {"label": "Authentication & Security", "icon": "Sparkles"},
        "ingestion": {"label": "Data Pipelines & Ingestion", "icon": "Activity"},
        "billing": {"label": "Billing & Payments", "icon": "Sparkles"},
        "database": {"label": "Databases & Storage", "icon": "Database"},
        "cache": {"label": "In-Memory Caching & Queues", "icon": "Server"},
        "external": {"label": "External Cloud Services", "icon": "Network"},
        "infra": {"label": "Infrastructure & CI/CD", "icon": "GitBranch"},
    }

    subsystems = [
        {"id": sub, "label": SUBSYSTEM_META.get(sub, {}).get("label", sub.capitalize()), "icon": SUBSYSTEM_META.get(sub, {}).get("icon", "Folder")}
        for sub in sorted(subsystem_set)
    ]

    return {
        "nodes": nodes,
        "edges": edges,
        "subsystems": subsystems,
        "project_name": proj_name,
        "repo_name": repo_name,
        "domain": domain_profile["domain"],
        "warnings": [],
    }


def build_architecture_graph() -> dict[str, Any]:
    """Fallback architecture graph for Forge AI system overview."""
    return {
        "nodes": [
            {
                "id": "fe:overview",
                "label": "Forge AI Workspace",
                "layer": "frontend",
                "subsystem": "frontend",
                "tier": 1,
                "detail": "/project/[id]",
                "role": "Collaborative project intelligence platform.",
                "icon": "Layers",
                "technologies": ["Next.js", "TailwindCSS", "ReactFlow"],
            },
            {
                "id": "api:gateway",
                "label": "FastAPI Gateway",
                "layer": "backend_api",
                "subsystem": "api",
                "tier": 2,
                "detail": "/api/v1",
                "role": "Routes requests to intelligence orchestrator and AI agents.",
                "icon": "Bot",
                "technologies": ["FastAPI", "Python", "Pydantic"],
            },
            {
                "id": "svc:intelligence",
                "label": "Project Intelligence Engine",
                "layer": "backend_service",
                "subsystem": "services",
                "tier": 3,
                "detail": "Intelligence & Memory",
                "role": "Extracts decisions, verifies consistency, and tracks architecture evolution.",
                "icon": "Cpu",
                "technologies": ["Qdrant", "OpenAI / Gemini", "Motor"],
            },
            {
                "id": "db:mongo",
                "label": "MongoDB Atlas",
                "layer": "external",
                "subsystem": "database",
                "tier": 4,
                "detail": "MongoDB",
                "role": "Operational database storing project state, constitutions, and decisions.",
                "icon": "Database",
                "technologies": ["MongoDB", "Motor"],
            },
        ],
        "edges": [
            {"id": "fe->api", "source": "fe:overview", "target": "api:gateway", "relation": "REST / WebSocket"},
            {"id": "api->svc", "source": "api:gateway", "target": "svc:intelligence", "relation": "Executes Logic"},
            {"id": "svc->db", "source": "svc:intelligence", "target": "db:mongo", "relation": "Persists State"},
        ],
        "subsystems": [
            {"id": "frontend", "label": "Frontend & UI", "icon": "Layers"},
            {"id": "api", "label": "API Gateway", "icon": "Bot"},
            {"id": "services", "label": "Intelligence Services", "icon": "Cpu"},
            {"id": "database", "label": "Databases", "icon": "Database"},
        ],
        "warnings": [],
    }
