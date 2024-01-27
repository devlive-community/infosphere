package org.devlive.infosphere.service.entity;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.EntityListeners;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.JoinColumn;
import javax.persistence.JoinTable;
import javax.persistence.ManyToOne;
import javax.persistence.Table;

import java.time.Instant;

@Data
@ToString
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "infosphere_article_access")
@EntityListeners(value = AuditingEntityListener.class)
public class ArticleAccessEntity
{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "ip_address")
    private String address;

    @Column(name = "user_agent")
    private String agent;

    @Column(name = "create_time")
    @CreatedDate
    private Instant createTime;

    @ManyToOne
    @JoinTable(name = "infosphere_article_access_article_relation",
            joinColumns = @JoinColumn(name = "access_id"),
            inverseJoinColumns = @JoinColumn(name = "article_id"))
    private ArticleEntity article;

    @ManyToOne
    @JoinTable(name = "infosphere_article_access_user_relation",
            joinColumns = @JoinColumn(name = "access_id"),
            inverseJoinColumns = @JoinColumn(name = "user_id"))
    private UserEntity user;
}
