from haversine import haversine, Unit

class GeoIndex:
    @staticmethod
    def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Returns distance in kilometers using Haversine formula."""
        return haversine((lat1, lon1), (lat2, lon2), unit=Unit.KILOMETERS)

    @staticmethod
    def is_within_radius(lat1: float, lon1: float, lat2: float, lon2: float, radius_km: float = 20.0) -> bool:
        return GeoIndex.calculate_distance(lat1, lon1, lat2, lon2) <= radius_km
