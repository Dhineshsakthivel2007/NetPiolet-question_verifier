"""
Base validator classes and the validator result type.

All validators inherit from BaseValidator and are registered via
the @register_validator decorator. The evaluation engine discovers
and invokes them by their type key.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from app.core.network_models import ParsedNetwork


@dataclass
class ValidatorResult:
    """Result returned by every validator invocation."""

    passed: bool
    message: str
    details: dict[str, Any] = field(default_factory=dict)
    score: float = 0.0  # 0.0 = fail, 1.0 = full pass, 0.5 = partial


class BaseValidator(ABC):
    """Abstract base for all plug-in validators.

    Subclasses are discovered automatically by the registry
    when decorated with @register_validator.

    Attributes:
        name: Unique type key, e.g. 'vlan_exists'
        description: Human-readable description for the AI catalog
        topic: Primary topic area, e.g. 'VLAN', 'OSPF'
        param_schema: JSON-schema-like description of expected params
    """

    name: str
    description: str
    topic: str = ""
    param_schema: list[dict[str, Any]] = []

    @abstractmethod
    def validate(self, network: ParsedNetwork, **params: Any) -> ValidatorResult:
        """Execute the validation check.

        Args:
            network: The complete parsed network topology
            **params: Dynamic parameters from the evaluation plan's CheckItem.params

        Returns:
            ValidatorResult with pass/fail, message, and details
        """
        ...


class FunctionValidator(BaseValidator):
    """Wraps a plain function as a validator.

    Used by the @register_validator decorator so developers can
    write simple functions instead of full classes.
    """

    def __init__(
        self,
        func: Any,
        name: str,
        description: str,
        topic: str = "",
        param_schema: list[dict[str, Any]] | None = None,
    ) -> None:
        self.name = name
        self.description = description
        self.topic = topic
        self.param_schema = param_schema or []
        self._func = func

    def validate(self, network: ParsedNetwork, **params: Any) -> ValidatorResult:
        return self._func(network, **params)


# ---------------------------------------------------------------------------
# Global registry storage (populated by @register_validator)
# ---------------------------------------------------------------------------
_VALIDATOR_REGISTRY: dict[str, BaseValidator] = {}


def register_validator(
    type_key: str,
    description: str = "",
    topic: str = "",
    param_schema: list[dict[str, Any]] | None = None,
):
    """Decorator to register a function as a named validator.

    Usage:
        @register_validator(
            "vlan_exists",
            description="Check that a VLAN exists on a device",
            topic="VLAN",
            param_schema=[
                {"name": "device", "type": "string", "required": True},
                {"name": "vlan_id", "type": "integer", "required": True},
            ],
        )
        def check_vlan_exists(network: ParsedNetwork, **params) -> ValidatorResult:
            ...
    """

    def decorator(func):
        validator = FunctionValidator(
            func=func,
            name=type_key,
            description=description or func.__doc__ or "",
            topic=topic,
            param_schema=param_schema or [],
        )
        _VALIDATOR_REGISTRY[type_key] = validator
        return func

    return decorator


def get_registry() -> dict[str, BaseValidator]:
    """Return the global validator registry."""
    return _VALIDATOR_REGISTRY


def get_validator(type_key: str) -> BaseValidator | None:
    """Look up a validator by its type key."""
    return _VALIDATOR_REGISTRY.get(type_key)
