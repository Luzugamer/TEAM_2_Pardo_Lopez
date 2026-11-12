package domain

type Item struct {
	ID           string   `json:"id"`
	Label        string   `json:"label"`
	Description  string   `json:"description"`
	Route        string   `json:"route"`
	Icon         string   `json:"icon"`
	Capabilities []string `json:"capabilities"`
}
