"""Identity routes — single-operator/single-tenant dev surface.

Per Mai v8 Brain-BC Part 6: the canonical chat envelope requires `tenant_id`
and `operator_id`. Until real SSO lands, Console surfaces these from
environment variables (AOS_TENANT_ID + AOS_OPERATOR_ID) via a dedicated
endpoint the frontend calls once at boot.
"""

from fastapi import APIRouter, HTTPException

from backend.app import config

router = APIRouter()


@router.get("/identity")
async def get_identity() -> dict[str, str]:
    """Return the current operator and tenant identifiers.

    Dev mode reads AOS_TENANT_ID + AOS_OPERATOR_ID from the environment.
    When the real SSO layer lands this is replaced by a session lookup.
    """
    if not config.AOS_TENANT_ID:
        raise HTTPException(
            status_code=500,
            detail=(
                "AOS_TENANT_ID is not configured. Set it in the Console "
                ".env — Mai canonical chat requires a tenant identifier."
            ),
        )
    if not config.AOS_OPERATOR_ID:
        raise HTTPException(
            status_code=500,
            detail=(
                "AOS_OPERATOR_ID is not configured. Set it in the Console "
                ".env — Mai canonical chat requires an operator identifier."
            ),
        )
    return {
        "tenant_id": config.AOS_TENANT_ID,
        "operator_id": config.AOS_OPERATOR_ID,
    }
