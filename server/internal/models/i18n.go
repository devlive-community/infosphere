package models

import (
	"encoding/json"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"time"
)

// I18nConfig serializes registry edits and supplies a revision for optimistic locking.
type I18nConfig struct {
	ContentMigrated bool `json:"-"`
	ID              uint `gorm:"primaryKey" json:"id"`
	Revision        int  `gorm:"not null" json:"revision"`
}

type SiteLocale struct {
	Code           string    `gorm:"primaryKey;size:64" json:"code"`
	NativeName     string    `gorm:"size:100;not null" json:"native_name"`
	Direction      string    `gorm:"size:3;not null" json:"direction"`
	Enabled        bool      `json:"enabled"`
	ContentEnabled bool      `json:"content_enabled"`
	UIEnabled      bool      `json:"ui_enabled"`
	IsDefault      bool      `json:"is_default"`
	FallbackLocale string    `gorm:"size:64" json:"fallback_locale"`
	SortOrder      int       `json:"sort_order"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// Draft and published values are separate: saving a draft never unpublishes live text.
type UIMessageBundle struct {
	Locale    string    `gorm:"primaryKey;size:64" json:"locale"`
	Draft     string    `gorm:"type:text" json:"-"`
	Published string    `gorm:"type:text" json:"-"`
	Revision  int       `gorm:"not null" json:"revision"`
	UpdatedBy uint      `json:"updated_by"`
	UpdatedAt time.Time `json:"updated_at"`
}

type LocalizedResourceContent struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	ResourceType string    `gorm:"size:40;uniqueIndex:uk_resource_locale;not null" json:"resource_type"`
	ResourceID   uint      `gorm:"uniqueIndex:uk_resource_locale;not null" json:"resource_id"`
	Locale       string    `gorm:"size:64;uniqueIndex:uk_resource_locale;not null" json:"locale"`
	Draft        string    `gorm:"type:text" json:"-"`
	Published    string    `gorm:"type:text" json:"-"`
	Revision     int       `gorm:"not null" json:"revision"`
	UpdatedBy    uint      `json:"updated_by"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// SeedI18n runs with schema migration; conflict-ignore preserves every administrator edit.
func SeedI18n(db *gorm.DB) error {
	return db.Transaction(func(tx *gorm.DB) error {
		var cfg I18nConfig
		result := tx.Where("id = ?", 1).Find(&cfg)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			locales := []SiteLocale{
				{Code: "zh-CN", NativeName: "简体中文", Direction: "ltr", Enabled: true, ContentEnabled: true, UIEnabled: true, IsDefault: true},
				{Code: "en", NativeName: "English", Direction: "ltr", Enabled: true, ContentEnabled: true, UIEnabled: true, FallbackLocale: "zh-CN", SortOrder: 1},
			}
			if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&locales).Error; err != nil {
				return err
			}
			if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&I18nConfig{ID: 1, Revision: 1}).Error; err != nil {
				return err
			}
		}
		if cfg.ContentMigrated {
			return nil
		}
		var cursor uint
		for {
			rows := []AchievementDefinition{}
			if err := tx.Where("id > ?", cursor).Order("id").Limit(200).Find(&rows).Error; err != nil {
				return err
			}
			for _, d := range rows {
				cursor = d.ID
				for locale, fields := range map[string]map[string]string{
					"zh-CN": {"name": d.Name, "description": d.Description, "locked_hint": d.LockedHint},
					"en":    {"name": d.NameEn, "description": d.DescriptionEn, "locked_hint": d.LockedHintEn},
				} {
					for key, value := range fields {
						if value == "" {
							delete(fields, key)
						}
					}
					raw, _ := json.Marshal(fields)
					// Empty legacy fields remain empty; fallback is resolved at read time.
					row := LocalizedResourceContent{ResourceType: "achievement", ResourceID: d.ID, Locale: locale, Draft: string(raw), Published: string(raw), Revision: 1}
					if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&row).Error; err != nil {
						return err
					}
				}
			}
			if len(rows) < 200 {
				break
			}
		}
		return tx.Model(&I18nConfig{}).Where("id = 1").Update("content_migrated", true).Error
	})
}
